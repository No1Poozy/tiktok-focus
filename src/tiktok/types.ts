/** Stable identity extracted from a canonical TikTok video URL. IDs stay strings. */
export interface TikTokVideoIdentity {
  readonly videoId: string;
  readonly canonicalUrl: string;
  readonly creator: string;
}

/** Optional metadata verified by the DOM adapter. */
export interface TikTokVideoMetadata {
  readonly caption?: string;
  readonly thumbnailUrl?: string;
  readonly durationSeconds?: number;
}

/** An observation must return an idempotent cleanup function. */
export type StopTikTokObservation = () => void;
