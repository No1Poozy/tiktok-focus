import { describe, expect, it } from 'vitest';
import { isHistoryEntryExpired } from '../../src/domain/history/history-rules';

const DAY = 24 * 60 * 60 * 1_000;
const NOW = Date.UTC(2026, 8, 19);

describe('history retention', () => {
  it('expires an entry exactly at the retention cutoff', () => {
    expect(isHistoryEntryExpired({ lastWatchedAt: NOW - 30 * DAY }, 30, NOW)).toBe(true);
    expect(isHistoryEntryExpired({ lastWatchedAt: NOW - 30 * DAY + 1 }, 30, NOW)).toBe(false);
  });

  it('retains future timestamps after a clock adjustment', () => {
    expect(isHistoryEntryExpired({ lastWatchedAt: NOW + DAY }, 30, NOW)).toBe(false);
  });

  it.each([0, -1, 1.5, 366, NaN])('rejects invalid retention %s', (retention) => {
    expect(() => isHistoryEntryExpired({ lastWatchedAt: NOW }, retention, NOW)).toThrow(RangeError);
  });

  it('rejects nonfinite timestamps', () => {
    expect(() => isHistoryEntryExpired({ lastWatchedAt: NaN }, 30, NOW)).toThrow(RangeError);
    expect(() => isHistoryEntryExpired({ lastWatchedAt: NOW }, 30, Infinity)).toThrow(RangeError);
  });
});
