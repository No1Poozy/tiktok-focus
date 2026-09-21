import { describe, expect, it } from 'vitest';
import {
  createDefaultSettings,
  DEFAULT_SETTINGS,
  isSettings,
} from '../../src/domain/settings/settings';

describe('settings', () => {
  it('starts with collection and future viewing features disabled', () => {
    expect(createDefaultSettings()).toEqual({
      resumePlaybackEnabled: false,
      historyEnabled: false,
      historyRetentionDays: 30,
    });
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    expect(createDefaultSettings()).not.toBe(DEFAULT_SETTINGS);
    expect(createDefaultSettings()).not.toBe(createDefaultSettings());
  });

  it.each([1, 30, 365])('accepts %s retention days', (days) => {
    expect(isSettings({ ...DEFAULT_SETTINGS, historyRetentionDays: days })).toBe(true);
  });

  it.each([0, -1, 366, 1.5, NaN, Infinity, '30', null])('rejects invalid retention %s', (days) => {
    expect(isSettings({ ...DEFAULT_SETTINGS, historyRetentionDays: days })).toBe(false);
  });

  it.each([
    undefined,
    null,
    [],
    {},
    true,
    'settings',
    { ...DEFAULT_SETTINGS, historyEnabled: 'true' },
  ])('rejects a malformed settings value %s', (value) => {
    expect(isSettings(value)).toBe(false);
  });
});
