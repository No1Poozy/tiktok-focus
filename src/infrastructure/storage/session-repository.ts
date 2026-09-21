import type { SessionRepository } from '../../application/ports/session-repository';
import { isWatchSession, type WatchSession } from '../../domain/playback/playback-state';
import { parseTikTokVideoUrl } from '../../tiktok/video-identity';
import { readCurrentSchemaData } from './migrations';
import { CURRENT_SCHEMA_VERSION, type StorageArea } from './storage-types';

export type { SessionRepository } from '../../application/ports/session-repository';
export const SESSION_STORAGE_KEY = 'watch-session';

function isValidSession(value: unknown): value is WatchSession {
  if (!isWatchSession(value)) return false;
  const identity = parseTikTokVideoUrl(value.canonicalUrl);
  return identity?.videoId === value.videoId && identity.canonicalUrl === value.canonicalUrl;
}

function copySession(value: WatchSession): WatchSession {
  return {
    videoId: value.videoId,
    canonicalUrl: value.canonicalUrl,
    positionSeconds: value.positionSeconds,
    updatedAt: value.updatedAt,
  };
}

export function createSessionRepository(storage: StorageArea): SessionRepository {
  return {
    async get() {
      const data = readCurrentSchemaData(await storage.get(SESSION_STORAGE_KEY));
      return isValidSession(data) ? copySession(data) : null;
    },
    async set(value) {
      if (!isValidSession(value)) throw new TypeError('Invalid watch session.');
      const data = copySession(value);
      readCurrentSchemaData(await storage.get(SESSION_STORAGE_KEY));
      await storage.set(SESSION_STORAGE_KEY, { schemaVersion: CURRENT_SCHEMA_VERSION, data });
    },
    async clear() {
      readCurrentSchemaData(await storage.get(SESSION_STORAGE_KEY));
      await storage.remove(SESSION_STORAGE_KEY);
    },
  };
}
