import type { WatchHistoryEntry } from './history-entry';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

/** Expiry includes the cutoff instant. A future timestamp is retained. */
export function isHistoryEntryExpired(
  entry: Pick<WatchHistoryEntry, 'lastWatchedAt'>,
  retentionDays: number,
  now: number,
): boolean {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
    throw new RangeError('History retention must be between 1 and 365 whole days.');
  }
  if (!Number.isFinite(entry.lastWatchedAt) || !Number.isFinite(now)) {
    throw new RangeError('History timestamps must be finite.');
  }

  return entry.lastWatchedAt <= now - retentionDays * MILLISECONDS_PER_DAY;
}
