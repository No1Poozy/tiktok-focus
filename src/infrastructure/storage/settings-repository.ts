import type { SettingsRepository } from '../../application/ports/settings-repository';
import { createDefaultSettings, isSettings, type Settings } from '../../domain/settings/settings';
import { readCurrentSchemaData } from './migrations';
import {
  CURRENT_SCHEMA_VERSION,
  type StorageArea,
  type VersionedStorageValue,
} from './storage-types';

export type { SettingsRepository } from '../../application/ports/settings-repository';

export const SETTINGS_STORAGE_KEY = 'settings';

export function createSettingsRepository(storage: StorageArea): SettingsRepository {
  return {
    async get(): Promise<Settings> {
      const data = readCurrentSchemaData(await storage.get(SETTINGS_STORAGE_KEY));
      return isSettings(data) ? copySettings(data) : createDefaultSettings();
    },
    async set(settings: Settings): Promise<void> {
      if (!isSettings(settings)) throw new TypeError('Invalid settings.');
      const data = copySettings(settings);

      // Recheck the persisted version before writing; never downgrade a future schema.
      readCurrentSchemaData(await storage.get(SETTINGS_STORAGE_KEY));
      const record: VersionedStorageValue<Settings> = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data,
      };
      await storage.set(SETTINGS_STORAGE_KEY, record);
    },
  };
}

/** Persist known fields only, even if an external caller supplies extra properties. */
function copySettings(settings: Settings): Settings {
  return {
    resumePlaybackEnabled: settings.resumePlaybackEnabled,
    historyEnabled: settings.historyEnabled,
    historyRetentionDays: settings.historyRetentionDays,
  };
}
