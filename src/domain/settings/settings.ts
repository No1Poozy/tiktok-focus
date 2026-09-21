/** Opt-in preferences. Watch history and resume stay local to this installation. */
export interface Settings {
  readonly resumePlaybackEnabled: boolean;
  readonly historyEnabled: boolean;
  readonly historyRetentionDays: number;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  resumePlaybackEnabled: false,
  historyEnabled: false,
  historyRetentionDays: 30,
});

export function createDefaultSettings(): Settings {
  return { ...DEFAULT_SETTINGS };
}

export function isSettings(value: unknown): value is Settings {
  if (typeof value !== 'object' || value === null) return false;

  return (
    'resumePlaybackEnabled' in value &&
    typeof value.resumePlaybackEnabled === 'boolean' &&
    'historyEnabled' in value &&
    typeof value.historyEnabled === 'boolean' &&
    'historyRetentionDays' in value &&
    typeof value.historyRetentionDays === 'number' &&
    Number.isInteger(value.historyRetentionDays) &&
    value.historyRetentionDays >= 1 &&
    value.historyRetentionDays <= 365
  );
}
