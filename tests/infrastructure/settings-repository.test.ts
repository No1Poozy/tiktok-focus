import { describe, expect, it, vi } from 'vitest';
import { createDefaultSettings, DEFAULT_SETTINGS } from '../../src/domain/settings/settings';
import {
  createSettingsRepository,
  SETTINGS_STORAGE_KEY,
} from '../../src/infrastructure/storage/settings-repository';
import {
  CURRENT_SCHEMA_VERSION,
  type StorageArea,
  UnsupportedSchemaVersionError,
} from '../../src/infrastructure/storage/storage-types';

function createStorage(initialValue?: unknown) {
  const values = new Map<string, unknown>();
  if (initialValue !== undefined) values.set(SETTINGS_STORAGE_KEY, initialValue);
  const storage = {
    get: vi.fn((key: string) => Promise.resolve(values.get(key))),
    set: vi.fn((key: string, value: unknown) => {
      values.set(key, value);
      return Promise.resolve();
    }),
    remove: vi.fn((key: string) => {
      values.delete(key);
      return Promise.resolve();
    }),
  } satisfies StorageArea;
  return storage;
}

describe('settings repository', () => {
  it('reads legacy Focus preferences without losing history and resume settings', async () => {
    const expected = {
      ...DEFAULT_SETTINGS,
      historyEnabled: true,
      resumePlaybackEnabled: true,
      historyRetentionDays: 90,
    };
    const storage = createStorage({
      schemaVersion: 1,
      data: { ...expected, focusModeEnabled: true },
    });
    const repository = createSettingsRepository(storage);
    expect(await repository.get()).toEqual(expected);
    expect(storage.set).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    await repository.set(await repository.get());
    expect(storage.set).toHaveBeenCalledWith(SETTINGS_STORAGE_KEY, {
      schemaVersion: 1,
      data: expected,
    });
  });
  it('returns fresh defaults for an empty store without writing', async () => {
    const storage = createStorage();
    const repository = createSettingsRepository(storage);
    const first = await repository.get();
    expect(first).toEqual(DEFAULT_SETTINGS);
    expect(first).not.toBe(await repository.get());
    expect(storage.set).not.toHaveBeenCalled();
  });

  it.each([
    null,
    'not an object',
    [],
    {},
    DEFAULT_SETTINGS,
    { schemaVersion: CURRENT_SCHEMA_VERSION },
    { schemaVersion: CURRENT_SCHEMA_VERSION, data: { ...DEFAULT_SETTINGS, historyEnabled: 'yes' } },
    {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: { ...DEFAULT_SETTINGS, historyRetentionDays: 0 },
    },
    { schemaVersion: '1', data: DEFAULT_SETTINGS },
  ])('safely defaults on malformed persisted data %#', async (record) => {
    const storage = createStorage(record);
    expect(await createSettingsRepository(storage).get()).toEqual(DEFAULT_SETTINGS);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('stores a versioned settings record and reads it back', async () => {
    const storage = createStorage();
    const repository = createSettingsRepository(storage);
    const settings = {
      ...createDefaultSettings(),
      resumePlaybackEnabled: true,
      historyRetentionDays: 90,
    };
    await repository.set(settings);
    expect(storage.set).toHaveBeenCalledWith(SETTINGS_STORAGE_KEY, {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: settings,
    });
    expect(await repository.get()).toEqual(settings);
    expect(await repository.get()).not.toBe(settings);
  });

  it('copies only known fields at both persistence boundaries', async () => {
    const settings = { ...DEFAULT_SETTINGS, unexpected: 'must not be persisted' };
    const storage = createStorage({ schemaVersion: CURRENT_SCHEMA_VERSION, data: settings });
    const repository = createSettingsRepository(storage);
    expect(await repository.get()).toEqual(DEFAULT_SETTINGS);
    await repository.set(settings);
    expect(storage.set).toHaveBeenCalledWith(SETTINGS_STORAGE_KEY, {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: DEFAULT_SETTINGS,
    });
  });

  it.each([0, CURRENT_SCHEMA_VERSION + 1, 999])(
    'refuses reading or overwriting unsupported schema %s',
    async (schemaVersion) => {
      const storage = createStorage({ schemaVersion, data: DEFAULT_SETTINGS });
      const repository = createSettingsRepository(storage);
      await expect(repository.get()).rejects.toBeInstanceOf(UnsupportedSchemaVersionError);
      await expect(repository.set(createDefaultSettings())).rejects.toBeInstanceOf(
        UnsupportedSchemaVersionError,
      );
      expect(storage.set).not.toHaveBeenCalled();
    },
  );

  it('validates outgoing data before touching storage', async () => {
    const storage = createStorage();
    const repository = createSettingsRepository(storage);
    await expect(
      repository.set({ ...DEFAULT_SETTINGS, historyRetentionDays: Infinity }),
    ).rejects.toThrow(TypeError);
    expect(storage.get).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('rechecks the persisted version when saving an earlier settings snapshot', async () => {
    const storage = createStorage();
    const repository = createSettingsRepository(storage);
    const settings = await repository.get();
    storage.get.mockResolvedValue({ schemaVersion: CURRENT_SCHEMA_VERSION + 1, data: settings });
    await expect(repository.set(settings)).rejects.toBeInstanceOf(UnsupportedSchemaVersionError);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('propagates storage read failures instead of presenting false defaults', async () => {
    const storage = createStorage();
    storage.get.mockRejectedValue(new Error('Storage unavailable'));
    const repository = createSettingsRepository(storage);
    await expect(repository.get()).rejects.toThrow('Storage unavailable');
    await expect(repository.set(createDefaultSettings())).rejects.toThrow('Storage unavailable');
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('propagates storage write failures', async () => {
    const storage = createStorage();
    storage.set.mockRejectedValue(new Error('Quota exceeded'));
    await expect(createSettingsRepository(storage).set(createDefaultSettings())).rejects.toThrow(
      'Quota exceeded',
    );
  });
});
