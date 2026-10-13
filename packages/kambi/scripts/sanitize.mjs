#!/usr/bin/env node
/**
 * Sanitizes a raw coupon/history.json capture for use as a test fixture.
 *
 *   node scripts/sanitize.mjs ~/Downloads/history.raw.json fixtures/captured/history-2026-09-27.json
 *
 * Drops fields that identify the account or session and replaces the values
 * of ID-like account fields with stable placeholders. Betting content (events,
 * markets, odds, stakes, statuses) is kept, since that's what the tests need.
 * Review the output before committing it.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('usage: sanitize.mjs <raw.json> <out.json>');
  process.exit(1);
}

// Removed entirely.
const DROP = /token|session|cookie|auth|password|email|phone|address|ip(Address)?$|birth|firstName|lastName|fullName/i;
// Kept, but value replaced with a placeholder consistent across the file.
const MASK = /^(punter|customer|account|user|player)(Id|Ref|Name)?$|^(punterId|customerId|accountId|userId)$/i;

const placeholders = new Map();
const mask = (v) => {
  const key = JSON.stringify(v);
  if (!placeholders.has(key)) placeholders.set(key, `REDACTED_${placeholders.size + 1}`);
  return placeholders.get(key);
};

const dropped = new Set();
function walk(node) {
  if (Array.isArray(node)) return node.map(walk);
  if (node === null || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (DROP.test(k)) {
      dropped.add(k);
      continue;
    }
    out[k] = MASK.test(k) ? mask(v) : walk(v);
  }
  return out;
}

const sanitized = walk(JSON.parse(readFileSync(input, 'utf8')));
writeFileSync(output, JSON.stringify(sanitized, null, 2) + '\n');
console.log(`wrote ${output}`);
if (dropped.size) console.log(`dropped keys: ${[...dropped].sort().join(', ')}`);
if (placeholders.size) console.log(`masked ${placeholders.size} distinct account identifier(s)`);
