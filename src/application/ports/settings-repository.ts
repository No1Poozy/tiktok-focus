import type { Settings } from '../../domain/settings/settings';

export interface SettingsRepository {
  get(): Promise<Settings>;
  /** Replaces the complete settings value after runtime validation. */
  set(settings: Settings): Promise<void>;
}
