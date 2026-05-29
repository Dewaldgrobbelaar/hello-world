export const COOKIE = 'auth';
export const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/** Creates a signed token: `<base36-timestamp>.<hex-hmac>` */
export async function createToken(secret: string): Promise<string> {
  const payload = Date.now().toString(36);
  const key = await importKey(secret);
  const raw = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sig = Array.from(new Uint8Array(raw), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${payload}.${sig}`;
}

/** Constant-time HMAC verification. */
export async function verifyToken(token: string, secret: string): Promise<boolean> {
  const sep = token.lastIndexOf('.');
  if (sep === -1) return false;
  const payload = token.slice(0, sep);
  const sig = token.slice(sep + 1);

  const key = await importKey(secret);
  const raw = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const expected = Array.from(new Uint8Array(raw), (b) => b.toString(16).padStart(2, '0')).join('');

  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= (expected.charCodeAt(i) ?? 0) ^ (sig.charCodeAt(i) ?? 0);
  }
  return diff === 0;
}

/** Constant-time string comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  const sa = new TextEncoder().encode(a);
  const sb = new TextEncoder().encode(b);
  if (sa.length !== sb.length) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i++) {
    diff |= (sa[i] ?? 0) ^ (sb[i] ?? 0);
  }
  return diff === 0;
}
