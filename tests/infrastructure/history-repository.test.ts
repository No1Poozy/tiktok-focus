import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { WatchHistoryEntry } from '../../src/domain/history/history-entry';
import { createHistoryRepository } from '../../src/infrastructure/storage/history-repository';
import { UnsupportedSchemaVersionError } from '../../src/infrastructure/storage/storage-types';

const entry: WatchHistoryEntry = {
  videoId: '123',
  canonicalUrl: 'https://www.tiktok.com/@tester/video/123',
  progressSeconds: 12,
  durationSeconds: 60,
  progressPercent: 20,
  firstWatchedAt: 100,
  lastWatchedAt: 200,
  watchCount: 1,
  completed: false,
};
let nextDatabase = 0;
function setup() {
  const name = `history-test-${String(nextDatabase++)}`;
  return { name, repository: createHistoryRepository(name) };
}
function withId(id: string, watchedAt = 200): WatchHistoryEntry {
  return {
    ...entry,
    videoId: id,
    canonicalUrl: `https://www.tiktok.com/@tester/video/${id}`,
    lastWatchedAt: watchedAt,
  };
}
async function putRaw(name: string, value: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(name);
    open.onerror = () => reject(open.error ?? new Error('Database open failed'));
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction('history', 'readwrite');
      transaction.objectStore('history').put(value);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error('Database write failed'));
      };
    };
  });
}

describe('IndexedDB watch history', () => {
  it('stores and reads versioned entries through separate worker instances', async () => {
    const { name, repository } = setup();
    expect(await repository.get('123')).toBeNull();
    await repository.upsert(entry);
    expect(await createHistoryRepository(name).get('123')).toEqual(entry);
  });

  it('copies known fields and isolates outgoing objects', async () => {
    const { repository } = setup();
    await repository.upsert({ ...entry, secret: 'omit me' } as WatchHistoryEntry);
    const saved = await repository.get('123');
    expect(saved).toEqual(entry);
    expect(saved).not.toBe(entry);
  });

  it('returns descending pages with timestamp ties and no omissions', async () => {
    const { repository } = setup();
    for (const value of [withId('1', 300), withId('2', 300), withId('3', 300), withId('4', 200)])
      await repository.upsert(value);
    expect((await repository.list({ limit: 2 })).map((value) => value.videoId)).toEqual(['3', '2']);
    expect(
      (await repository.list({ limit: 2, before: 300, beforeVideoId: '2' })).map(
        (value) => value.videoId,
      ),
    ).toEqual(['1', '4']);
    expect(
      (await repository.list({ limit: 5, before: 300 })).map((value) => value.videoId),
    ).toEqual(['4']);
  });

  it('prunes the cutoff inclusively and retains newer entries', async () => {
    const { repository } = setup();
    await repository.upsert(withId('1', 200));
    await repository.upsert(withId('2', 201));
    await repository.pruneBefore(200);
    expect(await repository.get('1')).toBeNull();
    expect(await repository.get('2')).not.toBeNull();
  });

  it('removes one row and clears the rest', async () => {
    const { repository } = setup();
    await repository.upsert(entry);
    await repository.upsert(withId('456'));
    await repository.remove('123');
    expect(await repository.get('123')).toBeNull();
    expect(await repository.get('456')).not.toBeNull();
    await repository.clear();
    expect(await repository.list({ limit: 10 })).toEqual([]);
  });

  it.each([
    { ...entry, canonicalUrl: 'javascript:alert(1)' },
    { ...entry, canonicalUrl: 'https://www.tiktok.com/@tester/video/999' },
    { ...entry, thumbnailUrl: 'http://tracker.test/image.jpg' },
    { ...entry, progressSeconds: Infinity },
    { ...entry, progressSeconds: 61 },
    { ...entry, watchCount: 0 },
    { ...entry, lastWatchedAt: 50 },
    { ...entry, lastWatchedAt: 1e100 },
  ])('rejects malformed outgoing entry %#', async (value) => {
    await expect(setup().repository.upsert(value)).rejects.toBeInstanceOf(TypeError);
  });

  it('skips malformed stored entries at read boundaries', async () => {
    const { name, repository } = setup();
    await repository.get('123');
    await putRaw(name, { schemaVersion: 1, data: { ...entry, progressSeconds: '12' } });
    expect(await repository.get('123')).toBeNull();
    expect(await repository.list({ limit: 10 })).toEqual([]);
  });

  it('preserves future records across upsert, delete, clear, and retention', async () => {
    const { name, repository } = setup();
    await repository.upsert(withId('100'));
    await putRaw(name, { schemaVersion: 2, data: entry });
    await expect(repository.get('123')).rejects.toBeInstanceOf(UnsupportedSchemaVersionError);
    await expect(repository.upsert(entry)).rejects.toBeInstanceOf(UnsupportedSchemaVersionError);
    await expect(repository.remove('123')).rejects.toBeInstanceOf(UnsupportedSchemaVersionError);
    await expect(repository.clear()).rejects.toBeInstanceOf(UnsupportedSchemaVersionError);
    // The aborted clear is atomic: even an earlier cursor deletion rolls back.
    expect(await repository.get('100')).not.toBeNull();
    await repository.pruneBefore(300);
    await expect(repository.get('123')).rejects.toBeInstanceOf(UnsupportedSchemaVersionError);
    expect(await repository.list({ limit: 10 })).toEqual([]);
  });

  it.each([
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { limit: 5, before: Infinity },
    { limit: 5, beforeVideoId: '123' },
  ])('rejects invalid query %#', async (query) => {
    await expect(setup().repository.list(query)).rejects.toBeInstanceOf(TypeError);
  });
});
