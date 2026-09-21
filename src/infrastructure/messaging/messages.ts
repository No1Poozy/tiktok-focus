import { isWatchProgressInput, type WatchProgressInput } from '../../application/history-service';
import type { HistoryQuery } from '../../application/ports/history-repository';
import { parseTikTokVideoUrl } from '../../tiktok/video-identity';

export const MESSAGE_TYPES = {
  getStatus: 'extension:get-status',
  recordProgress: 'history:record-progress',
  getResumePosition: 'history:get-resume-position',
  listHistory: 'history:list',
  removeHistory: 'history:remove',
  clearHistory: 'history:clear',
  getLastSession: 'session:get-last',
} as const;

export type HistoryRequest =
  | { type: typeof MESSAGE_TYPES.recordProgress; input: WatchProgressInput }
  | { type: typeof MESSAGE_TYPES.getResumePosition; videoId: string }
  | { type: typeof MESSAGE_TYPES.listHistory; query: HistoryQuery }
  | { type: typeof MESSAGE_TYPES.removeHistory; videoId: string }
  | { type: typeof MESSAGE_TYPES.clearHistory }
  | { type: typeof MESSAGE_TYPES.getLastSession };

export type HistoryResponse =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string };

export function isHistoryRequest(value: unknown): value is HistoryRequest {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  switch (value.type) {
    case MESSAGE_TYPES.clearHistory:
    case MESSAGE_TYPES.getLastSession:
      return true;
    case MESSAGE_TYPES.getResumePosition:
    case MESSAGE_TYPES.removeHistory:
      return 'videoId' in value && isVideoId(value.videoId);
    case MESSAGE_TYPES.recordProgress: {
      if (!('input' in value) || !isWatchProgressInput(value.input)) return false;
      const identity = parseTikTokVideoUrl(value.input.canonicalUrl);
      return (
        identity?.videoId === value.input.videoId &&
        identity.canonicalUrl === value.input.canonicalUrl
      );
    }
    case MESSAGE_TYPES.listHistory:
      return 'query' in value && isHistoryQuery(value.query);
    default:
      return false;
  }
}

function isVideoId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,30}$/.test(value);
}

function isHistoryQuery(value: unknown): value is HistoryQuery {
  if (typeof value !== 'object' || value === null || !('limit' in value)) return false;
  if (
    typeof value.limit !== 'number' ||
    !Number.isInteger(value.limit) ||
    value.limit < 1 ||
    value.limit > 100
  )
    return false;
  if (
    'before' in value &&
    (typeof value.before !== 'number' || !Number.isFinite(value.before) || value.before < 0)
  )
    return false;
  if ('beforeVideoId' in value && (!isVideoId(value.beforeVideoId) || !('before' in value)))
    return false;
  return true;
}

export function isHistoryResponse(value: unknown): value is HistoryResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    ((value.ok === true && 'value' in value) ||
      (value.ok === false && 'error' in value && typeof value.error === 'string'))
  );
}

export interface ExtensionStatusRequest {
  readonly type: typeof MESSAGE_TYPES.getStatus;
}

export interface ExtensionStatus {
  readonly version: string;
}

export function isStatusRequest(value: unknown): value is ExtensionStatusRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === MESSAGE_TYPES.getStatus
  );
}

export function isExtensionStatus(value: unknown): value is ExtensionStatus {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'string' &&
    /^\d+(?:\.\d+){0,3}$/.test(value.version)
  );
}
