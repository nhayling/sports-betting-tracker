import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseHistoryResponse, type RawHistoryResponse } from '../src';

/**
 * Invariants checked against real, sanitized Island Luck responses placed in
 * fixtures/captured/. Skipped until at least one capture exists.
 */
const dir = fileURLToPath(new URL('../fixtures/captured', import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

describe.skipIf(files.length === 0)('captured Island Luck responses', () => {
  for (const file of files) {
    describe(file, () => {
      const res = JSON.parse(readFileSync(join(dir, file), 'utf8')) as RawHistoryResponse;
      const coupons = parseHistoryResponse(res);

      it('contains coupons', () => {
        expect(coupons.length).toBeGreaterThan(0);
      });

      it('parses without warnings', () => {
        const warnings = coupons.flatMap((c) => c.warnings.map((w) => `${c.externalCouponRef}: ${w}`));
        expect(warnings).toEqual([]);
      });

      it('normalizes every bet status', () => {
        const unknown = coupons.flatMap((c) => c.bets.filter((b) => b.status === 'UNKNOWN').map((b) => b.rawStatus));
        expect(unknown).toEqual([]);
      });

      it('links every bet to at least one leg with resolved selections', () => {
        for (const c of coupons) {
          for (const b of c.bets) {
            expect(b.legs.length, `bet ${b.externalBetRef}`).toBeGreaterThan(0);
            for (const leg of b.legs) {
              expect(leg.eventId, `bet ${b.externalBetRef} row ${leg.externalRowIndex}`).not.toBeNull();
              for (const s of leg.selections) expect(s.marketName).not.toBeNull();
            }
          }
        }
      });
    });
  }
});
