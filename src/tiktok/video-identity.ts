import type { TikTokVideoIdentity } from './types';

const TIKTOK_ORIGIN = 'https://www.tiktok.com';
const VIDEO_PATH = /^\/@([A-Za-z0-9._]+)\/video\/([0-9]+)\/?(?:[?#][^\r\n]*)?$/;

/**
 * Parse absolute video permalinks only. Share links and feed URLs require a future
 * resolver. Match the raw path so URL normalization cannot hide ports, credentials,
 * backslashes, encoded separators, or dot segments. Search and hash are discarded.
 */
export function parseTikTokVideoUrl(url: string): TikTokVideoIdentity | null {
  if (url.slice(0, TIKTOK_ORIGIN.length).toLowerCase() !== TIKTOK_ORIGIN) {
    return null;
  }

  const path = url.slice(TIKTOK_ORIGIN.length);
  const match = VIDEO_PATH.exec(path);
  const creator = match?.[1];
  const videoId = match?.[2];

  // Comparing the complete match also rejects a trailing newline before `$`.
  if (match?.[0] !== path || !creator || !videoId) {
    return null;
  }

  return {
    videoId,
    canonicalUrl: `${TIKTOK_ORIGIN}/@${creator}/video/${videoId}`,
    creator,
  };
}
