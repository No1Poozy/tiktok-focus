import { describe, expect, it, vi } from 'vitest';
import {
  createHistoryService,
  isWatchProgressInput,
  type WatchProgressInput,
} from '../../src/application/history-service';
import type { HistoryRepository } from '../../src/application/ports/history-repository';
import type { SessionRepository } from '../../src/application/ports/session-repository';
import type { SettingsRepository } from '../../src/application/ports/settings-repository';
import type { WatchHistoryEntry } from '../../src/domain/history/history-entry';
import type { WatchSession } from '../../src/domain/playback/playback-state';
import { DEFAULT_SETTINGS, type Settings } from '../../src/domain/settings/settings';

const NOW = 2_000_000_000_000;
const input: WatchProgressInput = {
  videoId: '123',
  canonicalUrl: 'https://www.tiktok.com/@tester/video/123',
  durationSeconds: 60,
  progressSeconds: 12,
  watchedAt: NOW,
  watchSessionId: 'session-a',
};
function setup(
  initial: Settings = { ...DEFAULT_SETTINGS, historyEnabled: true, resumePlaybackEnabled: true },
) {
  let settings = initial;
  let time = NOW;
  let lastSession: WatchSession | null = null;
  const rows = new Map<string, WatchHistoryEntry>();
  const repository = {
    get: vi.fn((id: string) => Promise.resolve(rows.get(id) ?? null)),
    upsert: vi.fn((entry: WatchHistoryEntry) => {
      rows.set(entry.videoId, entry);
      return Promise.resolve();
    }),
    remove: vi.fn((id: string) => {
      rows.delete(id);
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      rows.clear();
      return Promise.resolve();
    }),
    list: vi.fn(() => Promise.resolve([...rows.values()])),
    pruneBefore: vi.fn((cutoff: number) => {
      for (const row of rows.values()) if (row.lastWatchedAt <= cutoff) rows.delete(row.videoId);
      return Promise.resolve();
    }),
  } satisfies HistoryRepository;
  const preferences = {
    get: () => Promise.resolve(settings),
    set: (next: Settings) => {
      settings = next;
      return Promise.resolve();
    },
  } satisfies SettingsRepository;
  const sessions = {
    get: () => Promise.resolve(lastSession),
    set: (next: WatchSession) => {
      lastSession = next;
      return Promise.resolve();
    },
    clear: () => {
      lastSession = null;
      return Promise.resolve();
    },
  } satisfies SessionRepository;
  const service = createHistoryService(repository, preferences, sessions, () => time);
  return {
    service,
    repository,
    preferences,
    sessions,
    rows,
    advance: (milliseconds: number) => {
      time += milliseconds;
    },
    restart: () => createHistoryService(repository, preferences, sessions, () => time),
  };
}

describe('history use cases', () => {
  it('records nothing without history consent, even if resume is enabled', async () => {
    const { service, repository, sessions } = setup({
      ...DEFAULT_SETTINGS,
      resumePlaybackEnabled: true,
    });
    await service.recordProgress(input);
    expect(repository.upsert).not.toHaveBeenCalled();
    expect(await sessions.get()).toBeNull();
    expect(await service.getResumePosition('123')).toBeNull();
  });

  it('captures progress, metadata, and last session and resumes it', async () => {
    const { service, rows } = setup();
    await service.recordProgress({ ...input, caption: 'A video', creator: 'tester' });
    await service.recordProgress({ ...input, progressSeconds: 15 });
    expect(rows.get('123')).toMatchObject({
      progressSeconds: 15,
      progressPercent: 25,
      watchCount: 1,
      caption: 'A video',
      creator: 'tester',
      firstWatchedAt: NOW,
      lastWatchedAt: NOW,
    });
    expect(await service.getResumePosition('123')).toBe(15);
    expect(await service.getLastSession()).toEqual({
      videoId: input.videoId,
      canonicalUrl: input.canonicalUrl,
      positionSeconds: 15,
      updatedAt: NOW,
    });
  });

  it('counts once per viewing session across interleaved tabs and worker restarts', async () => {
    const { service, rows, restart } = setup();
    await Promise.all([
      service.recordProgress(input),
      service.recordProgress({ ...input, watchSessionId: 'session-b', progressSeconds: 20 }),
      service.recordProgress({ ...input, progressSeconds: 25 }),
    ]);
    await restart().recordProgress({ ...input, watchSessionId: 'session-b', progressSeconds: 30 });
    expect(rows.get('123')).toMatchObject({ watchCount: 2, progressSeconds: 30 });
  });

  it('ignores stale progress without losing a newer last session', async () => {
    const { service, rows } = setup();
    await service.recordProgress(input);
    await service.recordProgress({ ...input, watchedAt: NOW - 1, progressSeconds: 2 });
    await service.recordProgress({
      ...input,
      videoId: '456',
      canonicalUrl: 'https://www.tiktok.com/@tester/video/456',
      watchedAt: NOW - 2,
    });
    expect(rows.get('123')?.progressSeconds).toBe(12);
    expect((await service.getLastSession())?.videoId).toBe('123');
  });

  it('keeps completion through auto-loop ticks but starts a new session normally', async () => {
    const { service, rows } = setup();
    await service.recordProgress({ ...input, progressSeconds: 80 });
    expect(rows.get('123')).toMatchObject({ progressSeconds: 60, completed: true });
    await service.recordProgress({ ...input, progressSeconds: 8 });
    expect(await service.getResumePosition('123')).toBeNull();
    await service.recordProgress({ ...input, progressSeconds: 8, watchSessionId: 'new-session' });
    expect(await service.getResumePosition('123')).toBe(8);
  });

  it('prunes on first use, at most hourly, and immediately when retention changes', async () => {
    const { service, repository, advance, preferences } = setup();
    await service.recordProgress(input);
    await service.recordProgress(input);
    await service.listHistory({ limit: 20 });
    expect(repository.pruneBefore).toHaveBeenCalledTimes(1);
    advance(3_600_000);
    await service.listHistory({ limit: 20 });
    expect(repository.pruneBefore).toHaveBeenCalledTimes(2);
    await preferences.set({ ...DEFAULT_SETTINGS, historyEnabled: true, historyRetentionDays: 1 });
    await service.listHistory({ limit: 20 });
    expect(repository.pruneBefore).toHaveBeenCalledTimes(3);
  });

  it('expires history and remembered session, and does not restore expired playback', async () => {
    const { service, advance, sessions } = setup();
    await service.recordProgress(input);
    advance(30 * 86_400_000);
    expect(await service.getResumePosition('123')).toBeNull();
    expect(await service.listHistory({ limit: 20 })).toEqual([]);
    expect(await sessions.get()).toBeNull();
  });

  it('refuses old or future records and resumes only when enabled', async () => {
    const { service, preferences, rows } = setup();
    await service.recordProgress({ ...input, watchedAt: NOW - 31 * 86_400_000 });
    expect(rows.size).toBe(0);
    await expect(service.recordProgress({ ...input, watchedAt: NOW + 60_001 })).rejects.toThrow(
      'timestamp',
    );
    await service.recordProgress(input);
    await preferences.set({ ...DEFAULT_SETTINGS, historyEnabled: true });
    expect(await service.getResumePosition('123')).toBeNull();
  });

  it('serializes clear and remove after already queued progress and forgets deleted sessions', async () => {
    const { service, rows } = setup();
    await Promise.all([service.recordProgress(input), service.removeHistory('123')]);
    expect(rows.size).toBe(0);
    expect(await service.getLastSession()).toBeNull();
    await Promise.all([service.recordProgress(input), service.clearHistory()]);
    expect(rows.size).toBe(0);
    expect(await service.getLastSession()).toBeNull();
  });

  it('continues processing after a storage error without swallowing that error', async () => {
    const { service, repository, rows } = setup();
    repository.upsert.mockRejectedValueOnce(new Error('quota'));
    await expect(service.recordProgress(input)).rejects.toThrow('quota');
    await service.recordProgress(input);
    expect(rows.get('123')?.watchCount).toBe(1);
  });
});

describe('watch progress boundary validation', () => {
  it('accepts a complete typed snapshot', () => expect(isWatchProgressInput(input)).toBe(true));
  it.each([
    null,
    {},
    { ...input, videoId: '' },
    { ...input, canonicalUrl: 'javascript:alert(1)' },
    { ...input, watchedAt: NaN },
    { ...input, progressSeconds: -1 },
    { ...input, durationSeconds: 0 },
    { ...input, watchSessionId: 'x'.repeat(129) },
    { ...input, caption: 'x'.repeat(4001) },
  ])('rejects invalid snapshot %#', (value) => {
    expect(isWatchProgressInput(value)).toBe(false);
  });
});
