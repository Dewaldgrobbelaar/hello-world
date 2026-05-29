import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { timingSafeEqual } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { downloadVoice, sendMessage, type InlineKeyboard } from '@/lib/telegram';
import { classifyCapture, type Company } from '@/lib/router/classifyCapture';

// ─── Telegram types ───────────────────────────────────────────────────────────

interface TelegramVoice {
  file_id: string;
  duration: number;
}

interface TelegramMessage {
  message_id: number;
  from?: { id: number };
  chat: { id: number };
  text?: string;
  voice?: TelegramVoice;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const KIND_EMOJI: Record<string, string> = {
  task: '✅',
  blocker: '🔴',
  journal: '📓',
  note: '📝',
  project_update: '🚀',
};

const URGENCY_LABEL: Record<string, string> = {
  today: '🔴 Today',
  this_week: '📅 This Week',
  this_month: '📆 This Month',
  someday: '📋 Someday',
};

function urgencyKeyboard(captureId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: '🔴 Today', callback_data: `urgency:today:${captureId}` },
        { text: '📅 Week', callback_data: `urgency:this_week:${captureId}` },
        { text: '📆 Month', callback_data: `urgency:this_month:${captureId}` },
      ],
      [
        { text: '📋 Someday', callback_data: `urgency:someday:${captureId}` },
        { text: '⭐ Key', callback_data: `urgency:key:${captureId}` },
      ],
    ],
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Verify Telegram webhook secret
  const headerSecret = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  const envSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  if (!timingSafeEqual(headerSecret, envSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const update = (await req.json()) as TelegramUpdate;
  const message = update.message;
  if (!message) return NextResponse.json({ ok: true });

  // 2. Verify sender is the authorised user
  const allowedId = parseInt(process.env.TELEGRAM_USER_ID ?? '0', 10);
  const fromId = message.from?.id;
  if (fromId === undefined || fromId !== allowedId) {
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat.id;
  const userId = process.env.SUPABASE_USER_ID ?? null;

  try {
    // 3. Resolve text (voice → Whisper, or plain text)
    let rawText: string;
    let source: string;
    let audioUrl: string | null = null;

    if (message.voice !== undefined) {
      const voiceBuffer = await downloadVoice(message.voice.file_id);
      const openai = new OpenAI();
      const transcription = await openai.audio.transcriptions.create({
        file: new File([voiceBuffer], 'voice.ogg', { type: 'audio/ogg' }),
        model: 'whisper-1',
      });
      rawText = transcription.text.trim();
      source = 'telegram_voice';
      audioUrl = `tg://file/${message.voice.file_id}`;
    } else if (message.text !== undefined) {
      rawText = message.text.trim();
      source = 'telegram_text';
    } else {
      return NextResponse.json({ ok: true }); // unsupported message type
    }

    if (!rawText) return NextResponse.json({ ok: true });

    // 4. Fetch companies for classification context
    const { data: companiesData } = await supabase
      .from('companies')
      .select('id, name')
      .order('name');
    const companies = (companiesData ?? []) as Company[];

    // 5. Classify
    const classification = await classifyCapture(rawText, companies);

    // 6. Determine downstream table
    const routedTo =
      classification.kind === 'task' || classification.kind === 'blocker'
        ? 'tasks'
        : classification.kind === 'journal'
          ? 'daily_logs'
          : null;

    // 7. Write raw_capture
    const { data: captureRow } = await supabase
      .from('raw_captures')
      .insert({
        user_id: userId,
        source,
        raw_text: rawText,
        audio_url: audioUrl,
        classification: {
          kind: classification.kind,
          urgency: classification.urgency,
          company_id: classification.company_id,
          tags: classification.tags,
          summary: classification.summary,
        },
        llm_source: classification.llm_source,
        routed_to: routedTo,
      })
      .select('id')
      .single();

    const captureId = (captureRow as { id: string } | null)?.id ?? '';

    // 8. Route to downstream table
    let routedId: string | null = null;

    if (classification.kind === 'task' || classification.kind === 'blocker') {
      const { data: taskRow } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          company_id: classification.company_id,
          title: classification.summary,
          description: rawText,
          urgency: classification.urgency,
          key: false,
          tags: classification.tags,
        })
        .select('id')
        .single();

      routedId = (taskRow as { id: string } | null)?.id ?? null;
    } else if (classification.kind === 'journal') {
      const today = new Date().toISOString().slice(0, 10);
      const { data: logRow } = await supabase
        .from('daily_logs')
        .insert({
          user_id: userId,
          log_date: today,
          notes: {
            captures: [
              {
                text: rawText,
                summary: classification.summary,
                ts: new Date().toISOString(),
              },
            ],
          },
        })
        .select('id')
        .single();

      routedId = (logRow as { id: string } | null)?.id ?? null;
    }

    // Back-fill routed_id on raw_capture
    if (captureId && routedId) {
      await supabase
        .from('raw_captures')
        .update({ routed_id: routedId })
        .eq('id', captureId);
    }

    // 9. Embed text → memory_chunks
    const openai = new OpenAI();
    const embRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: rawText,
    });
    const embedding = embRes.data[0]?.embedding ?? [];

    await supabase.from('memory_chunks').insert({
      user_id: userId,
      source_type: 'telegram',
      source_id: captureId || null,
      text: rawText,
      embedding,
    });

    // 10. Audit log
    await supabase.from('audit_log').insert({
      user_id: userId,
      action: 'capture_created',
      resource_type: 'raw_capture',
      resource_id: captureId || null,
      metadata: {
        source,
        kind: classification.kind,
        urgency: classification.urgency,
        company_id: classification.company_id,
        llm_source: classification.llm_source,
      },
    });

    // 11. Telegram reply
    const company = companies.find((c) => c.id === classification.company_id);
    const companyLine = company ? `🏢 ${company.name}` : '🏢 —';
    const tagsLine =
      classification.tags.length > 0
        ? `\n🏷 ${classification.tags.map((t) => `#${t}`).join(' ')}`
        : '';
    const emoji = KIND_EMOJI[classification.kind] ?? '📝';
    const urgencyText = URGENCY_LABEL[classification.urgency] ?? classification.urgency;

    const replyText =
      `${emoji} <b>${classification.kind.replace('_', ' ')}</b>  ·  ${urgencyText}\n` +
      `${companyLine}${tagsLine}\n` +
      `<i>${classification.summary}</i>`;

    await sendMessage(chatId, replyText, captureId ? urgencyKeyboard(captureId) : undefined);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[telegram/webhook]', err);
    try {
      await sendMessage(chatId, '⚠️ Something went wrong. Check the logs.');
    } catch {
      // swallow — Telegram reply is best-effort
    }
    return NextResponse.json({ ok: true }); // always 200 so Telegram doesn't retry
  }
}
