import {
  isBoundedString,
  isNonnegativeFinite,
  isSafeHttpsUrl,
  isTimestamp,
} from '../history/history-entry';

/** A domain snapshot, independent of HTMLMediaElement and TikTok's DOM. */
export interface PlaybackState {
  readonly videoId: string;
  readonly positionSeconds: number;
  /** Null represents media whose duration is not yet known. */
  readonly durationSeconds: number | null;
  readonly paused: boolean;
  readonly updatedAt: number;
}

/** Persistable last-viewed state; updatedAt is UTC Unix milliseconds. */
export interface WatchSession {
  readonly videoId: string;
  readonly canonicalUrl: string;
  readonly positionSeconds: number;
  readonly updatedAt: number;
}

export function isWatchSession(value: unknown): value is WatchSession {
  return (
    typeof value === 'object' &&
    value !== null &&
    'videoId' in value &&
    isBoundedString(value.videoId) &&
    'canonicalUrl' in value &&
    isSafeHttpsUrl(value.canonicalUrl) &&
    'positionSeconds' in value &&
    isNonnegativeFinite(value.positionSeconds) &&
    'updatedAt' in value &&
    isTimestamp(value.updatedAt)
  );
}
