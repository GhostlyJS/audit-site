// Anti-spam du formulaire sans service tiers : champ piège + délai minimal signé.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const HONEYPOT_FIELD = 'site_web';
export const MIN_DELAY_MS = 3000;
export const MAX_AGE_MS = 24 * 3600 * 1000;

export function issueFormToken(secret: string, now = Date.now()): string {
  const ts = String(now);
  return `${ts}.${sign(secret, ts)}`;
}

export type SpamVerdict = 'ok' | 'honeypot' | 'too-fast' | 'bad-token' | 'expired';

export function checkSubmission(
  secret: string,
  token: string | undefined,
  honeypot: string | undefined,
  now = Date.now(),
): SpamVerdict {
  if (honeypot && honeypot.trim() !== '') return 'honeypot';
  const [ts, sig] = (token ?? '').split('.');
  if (!ts || !sig || !/^\d+$/.test(ts)) return 'bad-token';
  const expected = Buffer.from(sign(secret, ts));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'bad-token';
  const age = now - Number(ts);
  if (age < MIN_DELAY_MS) return 'too-fast';
  if (age > MAX_AGE_MS) return 'expired';
  return 'ok';
}

function sign(secret: string, ts: string): string {
  return createHmac('sha256', secret).update('lead-form:' + ts).digest('base64url');
}
