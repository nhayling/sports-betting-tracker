/**
 * Sends the Postmark templates in apps/api/emails (uploaded with `npm run emails -- push`).
 *
 * POSTMARK_API_TOKEN  the Postmark server's API token; without it nothing is sent, only logged.
 * EMAIL_FROM          the sender, on a domain or address verified in Postmark. Default: Slip Club <hello@slipclub.app>.
 * EMAIL_REPLY_TO      where replies go. Default: slipclub@archipelagoapps.com.
 *
 * A send never throws: a failed email is logged and the sign-up or answer it follows still stands.
 */
export type TemplateAlias = 'access-received' | 'access-approved' | 'access-declined' | 'access-requested';

export interface Mailer {
  /** True once Postmark has accepted it. */
  send(to: string, template: TemplateAlias, model: Record<string, string | null>): Promise<boolean>;
}

export const POSTMARK_API = 'https://api.postmarkapp.com';
export const DEFAULT_FROM = 'Slip Club <hello@slipclub.app>';
export const DEFAULT_REPLY_TO = 'slipclub@archipelagoapps.com';

export function postmarkMailer(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Mailer {
  const token = env.POSTMARK_API_TOKEN?.trim();
  const from = env.EMAIL_FROM?.trim() || DEFAULT_FROM;
  const replyTo = env.EMAIL_REPLY_TO?.trim() || DEFAULT_REPLY_TO;
  return {
    async send(to, template, model) {
      if (!token) {
        console.log(`[email] not sent (no POSTMARK_API_TOKEN): ${template} to ${to}`);
        return false;
      }
      try {
        const res = await fetchImpl(`${POSTMARK_API}/email/withTemplate`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': token },
          body: JSON.stringify({ From: from, To: to, ReplyTo: replyTo, TemplateAlias: template, TemplateModel: model, MessageStream: 'outbound', Tag: template }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) return true;
        const body = (await res.json().catch(() => ({}))) as { ErrorCode?: number; Message?: string };
        console.error(`[email] ${template} to ${to} failed: ${res.status} ${body.ErrorCode ?? ''} ${body.Message ?? ''}`.trim());
      } catch (err) {
        console.error(`[email] ${template} to ${to} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      return false;
    },
  };
}

/** For tests and local work: remembers what would have gone out. */
export function recordingMailer() {
  const sent: { to: string; template: TemplateAlias; model: Record<string, string | null> }[] = [];
  const mailer: Mailer = {
    async send(to, template, model) {
      sent.push({ to, template, model });
      return true;
    },
  };
  return { mailer, sent };
}
