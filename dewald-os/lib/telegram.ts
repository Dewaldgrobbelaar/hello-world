const base = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN ?? ''}`;

export async function downloadVoice(fileId: string): Promise<ArrayBuffer> {
  const fileRes = await fetch(`${base()}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!fileRes.ok) throw new Error(`getFile failed: ${fileRes.status}`);
  const fileJson = (await fileRes.json()) as { result: { file_path: string } };
  const filePath = fileJson.result.file_path;

  const dlRes = await fetch(
    `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN ?? ''}/${filePath}`,
  );
  if (!dlRes.ok) throw new Error(`Voice download failed: ${dlRes.status}`);
  return dlRes.arrayBuffer();
}

export interface InlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
}

export async function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: InlineKeyboard,
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup !== undefined) body['reply_markup'] = replyMarkup;

  await fetch(`${base()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
