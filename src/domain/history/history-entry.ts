/** Timestamps are UTC Unix milliseconds; playback positions are seconds. */
export interface WatchHistoryEntry {
  readonly videoId: string;
  readonly canonicalUrl: string;
  readonly creator?: string;
  readonly caption?: string;
  readonly thumbnailUrl?: string;
  readonly durationSeconds?: number;
  readonly progressSeconds: number;
  /** Unknown duration means the percentage is unknown, not zero. */
  readonly progressPercent?: number;
  readonly firstWatchedAt: number;
  readonly lastWatchedAt: number;
  readonly watchCount: number;
  readonly completed: boolean;
  /** Active-view token, so periodic progress writes do not inflate watchCount. */
  readonly lastSessionId?: string;
  /** Bounded recent tokens also deduplicate interleaved tabs and worker restarts. */
  readonly recentSessionIds?: readonly string[];
}

export function isSafeHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4_096) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isBoundedString(value: unknown, maximum = 128): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

export function isNonnegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isTimestamp(value: unknown): value is number {
  return isNonnegativeFinite(value) && value <= 8_640_000_000_000_000;
}

export function isWatchHistoryEntry(value: unknown): value is WatchHistoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'videoId' in value &&
    isBoundedString(value.videoId) &&
    'canonicalUrl' in value &&
    isSafeHttpsUrl(value.canonicalUrl) &&
    (!('creator' in value) || isBoundedString(value.creator, 256)) &&
    (!('caption' in value) ||
      (typeof value.caption === 'string' && value.caption.length <= 4_000)) &&
    (!('thumbnailUrl' in value) || isSafeHttpsUrl(value.thumbnailUrl)) &&
    (!('durationSeconds' in value) ||
      (isNonnegativeFinite(value.durationSeconds) && value.durationSeconds > 0)) &&
    'progressSeconds' in value &&
    isNonnegativeFinite(value.progressSeconds) &&
    (!('durationSeconds' in value) || value.progressSeconds <= Number(value.durationSeconds)) &&
    (!('progressPercent' in value) ||
      (isNonnegativeFinite(value.progressPercent) && value.progressPercent <= 100)) &&
    'firstWatchedAt' in value &&
    isTimestamp(value.firstWatchedAt) &&
    'lastWatchedAt' in value &&
    isTimestamp(value.lastWatchedAt) &&
    value.lastWatchedAt >= value.firstWatchedAt &&
    'watchCount' in value &&
    typeof value.watchCount === 'number' &&
    Number.isSafeInteger(value.watchCount) &&
    value.watchCount >= 1 &&
    'completed' in value &&
    typeof value.completed === 'boolean' &&
    (!('lastSessionId' in value) || isBoundedString(value.lastSessionId)) &&
    (!('recentSessionIds' in value) ||
      (Array.isArray(value.recentSessionIds) &&
        value.recentSessionIds.length <= 20 &&
        value.recentSessionIds.every((id: unknown) => isBoundedString(id))))
  );
}
