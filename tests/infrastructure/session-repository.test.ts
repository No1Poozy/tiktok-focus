import { describe, expect, it, vi } from 'vitest';
import type { WatchSession } from '../../src/domain/playback/playback-state';
import {
  createSessionRepository,
  SESSION_STORAGE_KEY,
} from '../../src/infrastructure/storage/session-repository';
import {
  type StorageArea,
  UnsupportedSchemaVersionError,
} from '../../src/infrastructure/storage/storage-types';

const session: WatchSession = {
  videoId: '123',
  canonicalUrl: 'https://www.tiktok.com/@tester/video/123',
  positionSeconds: 12,
  updatedAt: 100,
};
function setup(initial?: unknown) {
  let value = initial;
  const storage = {
    get: vi.fn(() => Promise.resolve(value)),
    set: vi.fn((_key: string, next: unknown) => {
      value = next;
      return Promise.resolve();
    }),
    remove: vi.fn(() => {
      value = undefined;
      return Promise.resolve();
    }),
  } satisfies StorageArea;
  return { repository: createSessionRepository(storage), storage };
}

describe('watch session storage', () => {
  it('roundtrips known fields in a versioned record and can clear it', async () => {
    const { repository, storage } = setup();
    expect(await repository.get()).toBeNull();
    await repository.set({ ...session, unexpected: 5 } as WatchSession);
    expect(storage.set).toHaveBeenCalledWith(SESSION_STORAGE_KEY, {
      schemaVersion: 1,
      data: session,
    });
    expect(await repository.get()).toEqual(session);
    await repository.clear();
    expect(await repository.get()).toBeNull();
  });

  it.each([
    null,
    {},
    { ...session, positionSeconds: -1 },
    { ...session, updatedAt: Infinity },
    { ...session, canonicalUrl: 'https://www.tiktok.com/@tester/video/456' },
  ])('ignores malformed saved data %#', async (data) => {
    const { repository, storage } = setup({ schemaVersion: 1, data });
    expect(await repository.get()).toBeNull();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('preserves future schemas for reads, writes, and clear', async () => {
    const { repository, storage } = setup({ schemaVersion: 2, data: session });
    await expect(repository.get()).rejects.toBeInstanceOf(UnsupportedSchemaVersionError);
    await expect(repository.set(session)).rejects.toBeInstanceOf(UnsupportedSchemaVersionError);
    await expect(repository.clear()).rejects.toBeInstanceOf(UnsupportedSchemaVersionError);
    expect(storage.set).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('rejects unsafe URLs before accessing storage', async () => {
    const { repository, storage } = setup();
    await expect(
      repository.set({ ...session, canonicalUrl: 'javascript:alert(1)' }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(storage.get).not.toHaveBeenCalled();
  });
});
