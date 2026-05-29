import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export const CAPTURE_KINDS = ['task', 'blocker', 'journal', 'note', 'project_update'] as const;
export const TASK_URGENCIES = ['today', 'this_week', 'this_month', 'someday'] as const;

export type CaptureKind = (typeof CAPTURE_KINDS)[number];
export type TaskUrgency = (typeof TASK_URGENCIES)[number];

export interface CaptureClassification {
  kind: CaptureKind;
  urgency: TaskUrgency;
  company_id: string | null;
  tags: string[];
  summary: string;
}

export interface ClassifyResult extends CaptureClassification {
  llm_source: string;
}

export interface Company {
  id: string;
  name: string;
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function isKind(v: unknown): v is CaptureKind {
  return typeof v === 'string' && (CAPTURE_KINDS as readonly string[]).includes(v);
}

function isUrgency(v: unknown): v is TaskUrgency {
  return typeof v === 'string' && (TASK_URGENCIES as readonly string[]).includes(v);
}

function parseClassification(raw: Record<string, unknown>): CaptureClassification {
  return {
    kind: isKind(raw['kind']) ? raw['kind'] : 'note',
    urgency: isUrgency(raw['urgency']) ? raw['urgency'] : 'someday',
    company_id: typeof raw['company_id'] === 'string' ? raw['company_id'] : null,
    tags: Array.isArray(raw['tags'])
      ? raw['tags'].filter((t): t is string => typeof t === 'string')
      : [],
    summary:
      typeof raw['summary'] === 'string' ? raw['summary'].slice(0, 100) : '',
  };
}

// ─── Classifiers ──────────────────────────────────────────────────────────────

function buildSystemPrompt(companies: Company[]): string {
  const co = companies.map((c) => `  • "${c.name}" → id: ${c.id}`).join('\n');
  return `You classify short voice/text captures from a personal productivity dashboard.

Available companies:
${co}

Rules:
- kind: task (action items/todos) | blocker (something blocked/stuck) | journal (personal reflections) | note (information/FYI) | project_update (project status)
- urgency: today | this_week | this_month | someday
- company_id: UUID from the list above, or null if none match
- tags: 2–5 lowercase tags without #
- summary: one clear sentence, max 100 chars`;
}

async function classifyWithClaude(
  text: string,
  companies: Company[],
): Promise<CaptureClassification> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: buildSystemPrompt(companies),
    messages: [{ role: 'user', content: text }],
    tools: [
      {
        name: 'classify',
        description: 'Emit the classification result',
        input_schema: {
          type: 'object' as const,
          properties: {
            kind: { type: 'string', enum: [...CAPTURE_KINDS] },
            urgency: { type: 'string', enum: [...TASK_URGENCIES] },
            company_id: { type: ['string', 'null'] },
            tags: { type: 'array', items: { type: 'string' } },
            summary: { type: 'string' },
          },
          required: ['kind', 'urgency', 'company_id', 'tags', 'summary'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'classify' },
  });

  const block = msg.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') throw new Error('No tool_use block in Claude response');
  return parseClassification(block.input as Record<string, unknown>);
}

async function classifyWithOpenAI(
  text: string,
  companies: Company[],
): Promise<CaptureClassification> {
  const client = new OpenAI();
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          buildSystemPrompt(companies) +
          '\n\nRespond with a JSON object with keys: kind, urgency, company_id, tags, summary.',
      },
      { role: 'user', content: text },
    ],
  });

  const content = completion.choices[0]?.message.content ?? '{}';
  return parseClassification(JSON.parse(content) as Record<string, unknown>);
}

function classifyWithRegex(text: string, companies: Company[]): CaptureClassification {
  const lo = text.toLowerCase();

  let kind: CaptureKind = 'note';
  if (/\b(need to|should|must|todo|do|call|email|send|schedule|book|check|create|fix|review|follow up)\b/.test(lo)) kind = 'task';
  else if (/\b(blocked|stuck|waiting on|can't proceed|issue|problem|blocker)\b/.test(lo)) kind = 'blocker';
  else if (/\b(feel|feeling|today was|mood|reflecting|journal|diary|grateful)\b/.test(lo)) kind = 'journal';
  else if (/\b(update|progress|status|shipped|deployed|launched|milestone)\b/.test(lo)) kind = 'project_update';

  let urgency: TaskUrgency = 'someday';
  if (/\b(today|urgent|asap|right now|immediately)\b/.test(lo)) urgency = 'today';
  else if (/\b(this week|by friday|end of week|eow)\b/.test(lo)) urgency = 'this_week';
  else if (/\b(this month|end of month|eom)\b/.test(lo)) urgency = 'this_month';

  let company_id: string | null = null;
  for (const c of companies) {
    const first = c.name.toLowerCase().split(' ')[0];
    if (first && lo.includes(first)) {
      company_id = c.id;
      break;
    }
  }

  return {
    kind,
    urgency,
    company_id,
    tags: [],
    summary: text.slice(0, 100),
  };
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function classifyCapture(
  text: string,
  companies: Company[],
): Promise<ClassifyResult> {
  try {
    const result = await classifyWithClaude(text, companies);
    return { ...result, llm_source: 'claude-sonnet-4-6' };
  } catch (err) {
    console.error('[classify] Claude failed:', err);
  }

  try {
    const result = await classifyWithOpenAI(text, companies);
    return { ...result, llm_source: 'gpt-4o-mini' };
  } catch (err) {
    console.error('[classify] OpenAI failed:', err);
  }

  return { ...classifyWithRegex(text, companies), llm_source: 'regex' };
}
