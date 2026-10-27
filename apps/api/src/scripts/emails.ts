/**
 * The Postmark templates in apps/api/emails.
 *
 *   npm run emails -w @sports-better/api -- push                 # creates or updates them on the Postmark server (layout first)
 *   npm run emails -w @sports-better/api -- test <alias> <to>    # sends one, filled with its meta.json TestRenderModel
 *
 * Uses POSTMARK_API_TOKEN, EMAIL_FROM and EMAIL_REPLY_TO, as the app does (src/email/mailer.ts).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { POSTMARK_API, postmarkMailer, type TemplateAlias } from '../email/mailer';

const dir = fileURLToPath(new URL('../../emails', import.meta.url));
const token = process.env.POSTMARK_API_TOKEN?.trim();
if (!token) {
  console.error('Set POSTMARK_API_TOKEN (the Postmark server’s API token) in .env first.');
  process.exit(1);
}

interface Meta {
  Name: string;
  Alias: string;
  Subject?: string;
  TemplateType: 'Standard' | 'Layout';
  LayoutTemplate?: string;
  TestRenderModel?: Record<string, string>;
}
const read = (path: string) => readFileSync(`${dir}/${path}`, 'utf8');
const templates = (folder: string) =>
  readdirSync(`${dir}/${folder}`, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => {
      const base = folder === '.' ? d.name : `${folder}/${d.name}`;
      return { meta: JSON.parse(read(`${base}/meta.json`)) as Meta, html: read(`${base}/content.html`), text: read(`${base}/content.txt`) };
    });

const api = (path: string, method = 'GET', body?: unknown) =>
  fetch(`${POSTMARK_API}${path}`, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const [action, alias, to] = process.argv.slice(2);

if (action === 'push') {
  // Layouts first: a template can only name a layout that's already there.
  for (const { meta, html, text } of [...templates('_layouts'), ...templates('.')]) {
    const exists = (await api(`/templates/${meta.Alias}`)).ok;
    const res = await api(exists ? `/templates/${meta.Alias}` : '/templates', exists ? 'PUT' : 'POST', {
      Name: meta.Name,
      Alias: meta.Alias,
      HtmlBody: html,
      TextBody: text,
      ...(meta.TemplateType === 'Layout' ? { TemplateType: 'Layout' } : { TemplateType: 'Standard', Subject: meta.Subject, LayoutTemplate: meta.LayoutTemplate }),
    });
    const body = (await res.json().catch(() => ({}))) as { Message?: string };
    if (!res.ok) {
      console.error(`${meta.Alias}: ${res.status} ${body.Message ?? ''}`);
      process.exit(1);
    }
    console.log(`${exists ? 'Updated' : 'Created'} ${meta.Alias}`);
  }
} else if (action === 'test' && alias && to) {
  const found = templates('.').find((t) => t.meta.Alias === alias);
  if (!found) {
    console.error(`No template called ${alias}. There are: ${templates('.').map((t) => t.meta.Alias).join(', ')}`);
    process.exit(1);
  }
  const sent = await postmarkMailer().send(to, alias as TemplateAlias, found.meta.TestRenderModel ?? {});
  console.log(sent ? `Sent ${alias} to ${to}.` : 'Not sent (see above).');
  if (!sent) process.exit(1);
} else {
  console.error('usage: npm run emails -w @sports-better/api -- push | test <alias> <to>');
  process.exit(1);
}
