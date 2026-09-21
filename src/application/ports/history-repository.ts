import type { WatchHistoryEntry } from '../../domain/history/history-entry';

export interface HistoryQuery {
  /** Maximum number of entries, ordered by lastWatchedAt descending. */
  readonly limit: number;
  /** Only entries watched before this UTC Unix millisecond timestamp. */
  readonly before?: number;
  /** Tie-breaker from the last row, used with before for lossless pagination. */
  readonly beforeVideoId?: string;
}

/** Persistence boundary; implementations preserve unsupported future records. */
export interface HistoryRepository {
  get(videoId: string): Promise<WatchHistoryEntry | null>;
  upsert(entry: WatchHistoryEntry): Promise<void>;
  remove(videoId: string): Promise<void>;
  list(query: HistoryQuery): Promise<readonly WatchHistoryEntry[]>;
  clear(): Promise<void>;
  /** Remove current-schema records watched at or before the cutoff instant. */
  pruneBefore(cutoff: number): Promise<void>;
}
