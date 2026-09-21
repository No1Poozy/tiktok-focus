import type { HistoryQuery, HistoryRepository } from '../../application/ports/history-repository';
import {
  isBoundedString,
  isNonnegativeFinite,
  isWatchHistoryEntry,
  type WatchHistoryEntry,
} from '../../domain/history/history-entry';
import { parseTikTokVideoUrl } from '../../tiktok/video-identity';
import { readCurrentSchemaData } from './migrations';
import { CURRENT_SCHEMA_VERSION, UnsupportedSchemaVersionError } from './storage-types';

export type { HistoryQuery, HistoryRepository } from '../../application/ports/history-repository';

export const HISTORY_DATABASE_NAME = 'tiktok-focus-history';
const DATABASE_VERSION = 1;
const STORE_NAME = 'history';
const ORDER_INDEX = 'lastWatchedAt_videoId';

function isValidEntry(value: unknown): value is WatchHistoryEntry {
  if (!isWatchHistoryEntry(value)) return false;
  const identity = parseTikTokVideoUrl(value.canonicalUrl);
  return identity?.videoId === value.videoId && identity.canonicalUrl === value.canonicalUrl;
}

function copyEntry(entry: WatchHistoryEntry): WatchHistoryEntry {
  return {
    videoId: entry.videoId,
    canonicalUrl: entry.canonicalUrl,
    ...(entry.creator !== undefined ? { creator: entry.creator } : {}),
    ...(entry.caption !== undefined ? { caption: entry.caption } : {}),
    ...(entry.thumbnailUrl !== undefined ? { thumbnailUrl: entry.thumbnailUrl } : {}),
    ...(entry.durationSeconds !== undefined ? { durationSeconds: entry.durationSeconds } : {}),
    progressSeconds: entry.progressSeconds,
    ...(entry.progressPercent !== undefined ? { progressPercent: entry.progressPercent } : {}),
    firstWatchedAt: entry.firstWatchedAt,
    lastWatchedAt: entry.lastWatchedAt,
    watchCount: entry.watchCount,
    completed: entry.completed,
    ...(entry.lastSessionId !== undefined ? { lastSessionId: entry.lastSessionId } : {}),
    ...(entry.recentSessionIds !== undefined
      ? { recentSessionIds: [...entry.recentSessionIds] }
      : {}),
  };
}

function readEntry(record: unknown): WatchHistoryEntry | null {
  const value = readCurrentSchemaData(record);
  return isValidEntry(value) ? copyEntry(value) : null;
}

function readEnumerableEntry(record: unknown): WatchHistoryEntry | null {
  try {
    return readEntry(record);
  } catch (error) {
    if (error instanceof UnsupportedSchemaVersionError) return null;
    throw error;
  }
}

function checkVideoId(videoId: string): void {
  if (!isBoundedString(videoId) || !/^[0-9]+$/.test(videoId))
    throw new TypeError('Invalid video ID.');
}

/** Construct in the extension worker only: content-script IndexedDB belongs to the site. */
export function createHistoryRepository(databaseName = HISTORY_DATABASE_NAME): HistoryRepository {
  let databasePromise: Promise<IDBDatabase> | undefined;
  function open(): Promise<IDBDatabase> {
    databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        // Schema one has no older released IndexedDB schema to migrate.
        const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'data.videoId' });
        store.createIndex(ORDER_INDEX, ['data.lastWatchedAt', 'data.videoId']);
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          databasePromise = undefined;
        };
        resolve(database);
      };
      request.onerror = () => {
        databasePromise = undefined;
        reject(request.error ?? new Error('Unable to open watch history.'));
      };
      request.onblocked = () => {
        databasePromise = undefined;
        reject(new Error('Close other extension pages and retry updating watch history.'));
      };
    });
    return databasePromise;
  }

  async function transaction<T>(
    mode: IDBTransactionMode,
    operation: (
      store: IDBObjectStore,
      finish: (value: T) => void,
      guard: (action: () => void) => void,
    ) => void,
  ): Promise<T> {
    const database = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, mode);
      let result: T;
      let finished = false;
      let failure: Error | undefined;
      tx.oncomplete = () => {
        if (finished) resolve(result);
        else reject(new Error('History operation did not complete.'));
      };
      tx.onerror = () =>
        reject(failure ?? tx.error ?? new Error('Watch history could not be saved.'));
      tx.onabort = () =>
        reject(failure ?? tx.error ?? new Error('Watch history operation was aborted.'));
      const guard = (action: () => void): void => {
        try {
          action();
        } catch (error) {
          failure =
            error instanceof Error
              ? error
              : new Error('History operation failed.', { cause: error });
          tx.abort();
        }
      };
      guard(() =>
        operation(
          tx.objectStore(STORE_NAME),
          (value) => {
            result = value;
            finished = true;
          },
          guard,
        ),
      );
    });
  }

  return {
    async get(videoId) {
      checkVideoId(videoId);
      return transaction<WatchHistoryEntry | null>('readonly', (store, finish, guard) => {
        const request = store.get(videoId);
        request.onsuccess = () => guard(() => finish(readEntry(request.result)));
      });
    },
    async upsert(entry) {
      if (!isValidEntry(entry)) throw new TypeError('Invalid watch history entry.');
      const data = copyEntry(entry);
      return transaction<void>('readwrite', (store, finish, guard) => {
        const request = store.get(data.videoId);
        request.onsuccess = () =>
          guard(() => {
            // This check and write share one transaction, protecting future payload versions.
            readCurrentSchemaData(request.result);
            store.put({ schemaVersion: CURRENT_SCHEMA_VERSION, data });
            finish();
          });
      });
    },
    async remove(videoId) {
      checkVideoId(videoId);
      return transaction<void>('readwrite', (store, finish, guard) => {
        const request = store.get(videoId);
        request.onsuccess = () =>
          guard(() => {
            readCurrentSchemaData(request.result);
            store.delete(videoId);
            finish();
          });
      });
    },
    async list(query: HistoryQuery) {
      if (
        !Number.isInteger(query.limit) ||
        query.limit < 1 ||
        query.limit > 100 ||
        (query.before !== undefined && !isNonnegativeFinite(query.before)) ||
        (query.beforeVideoId !== undefined &&
          (query.before === undefined || !isBoundedString(query.beforeVideoId)))
      ) {
        throw new TypeError('Invalid history query.');
      }
      const range =
        query.before === undefined
          ? undefined
          : IDBKeyRange.upperBound([query.before, query.beforeVideoId ?? ''], true);
      return transaction<readonly WatchHistoryEntry[]>('readonly', (store, finish, guard) => {
        const entries: WatchHistoryEntry[] = [];
        const request = store.index(ORDER_INDEX).openCursor(range, 'prev');
        request.onsuccess = () =>
          guard(() => {
            const cursor = request.result;
            if (!cursor || entries.length >= query.limit) {
              finish(entries);
              return;
            }
            const entry = readEnumerableEntry(cursor.value);
            if (entry) entries.push(entry);
            if (entries.length >= query.limit) finish(entries);
            else cursor.continue();
          });
      });
    },
    async clear() {
      return transaction<void>('readwrite', (store, finish, guard) => {
        const request = store.openCursor();
        request.onsuccess = () =>
          guard(() => {
            const cursor = request.result;
            if (!cursor) {
              finish();
              return;
            }
            // Refuse the whole transaction if any future record would be removed.
            readCurrentSchemaData(cursor.value);
            cursor.delete();
            cursor.continue();
          });
      });
    },
    async pruneBefore(cutoff) {
      if (!Number.isFinite(cutoff)) throw new TypeError('Invalid retention cutoff.');
      return transaction<void>('readwrite', (store, finish, guard) => {
        const request = store.index(ORDER_INDEX).openCursor(IDBKeyRange.upperBound([cutoff, []]));
        request.onsuccess = () =>
          guard(() => {
            const cursor = request.result;
            if (!cursor) {
              finish();
              return;
            }
            const entry = readEnumerableEntry(cursor.value);
            if (entry && entry.lastWatchedAt <= cutoff) cursor.delete();
            cursor.continue();
          });
      });
    },
  };
}
