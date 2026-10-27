import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FROM, DEFAULT_REPLY_TO, postmarkMailer } from '../src/email/mailer';

describe('postmark mailer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends a template through Postmark', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"ErrorCode":0}', { status: 200 }));
    const mailer = postmarkMailer({ POSTMARK_API_TOKEN: 'server-token', EMAIL_REPLY_TO: 'noah@example.com' }, fetchImpl as unknown as typeof fetch);
    expect(await mailer.send('tbone@example.com', 'access-approved', { username: 'tbone' })).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.postmarkapp.com/email/withTemplate');
    expect((init.headers as Record<string, string>)['X-Postmark-Server-Token']).toBe('server-token');
    expect(JSON.parse(init.body as string)).toMatchObject({ From: DEFAULT_FROM, To: 'tbone@example.com', ReplyTo: 'noah@example.com', TemplateAlias: 'access-approved', TemplateModel: { username: 'tbone' } });
  });

  it('sends from hello@ with replies to the team inbox by default', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    await postmarkMailer({ POSTMARK_API_TOKEN: 't' }, fetchImpl as unknown as typeof fetch).send('a@example.com', 'access-declined', {});
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ From: DEFAULT_FROM, ReplyTo: DEFAULT_REPLY_TO });
    expect(DEFAULT_REPLY_TO).toBe('slipclub@archipelagoapps.com');
  });

  it('sends nothing without a token', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchImpl = vi.fn();
    expect(await postmarkMailer({}, fetchImpl as unknown as typeof fetch).send('a@example.com', 'access-declined', {})).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never throws when Postmark refuses or is down', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const refused = vi.fn(async () => new Response('{"ErrorCode":400,"Message":"Sender signature not found"}', { status: 422 }));
    expect(await postmarkMailer({ POSTMARK_API_TOKEN: 't' }, refused as unknown as typeof fetch).send('a@example.com', 'access-declined', {})).toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Sender signature not found'));
    const down = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    expect(await postmarkMailer({ POSTMARK_API_TOKEN: 't' }, down as unknown as typeof fetch).send('a@example.com', 'access-declined', {})).toBe(false);
  });
});
