import {
  isBoundedString,
  isNonnegativeFinite,
  isSafeHttpsUrl,
  isTimestamp,
  type WatchHistoryEntry,
} from '../domain/history/history-entry';
import { isHistoryEntryExpired } from '../domain/history/history-rules';
import {
  clampPlaybackPosition,
  getPlaybackProgressPercent,
  getResumablePosition,
  isPlaybackCompleted,
} from '../domain/playback/playback-rules';
import type { WatchSession } from '../domain/playback/playback-state';
import type { Settings } from '../domain/settings/settings';
import type { HistoryQuery, HistoryRepository } from './ports/history-repository';
import type { SessionRepository } from './ports/session-repository';
import type { SettingsRepository } from './ports/settings-repository';

export interface WatchProgressInput {
  readonly videoId: string;
  readonly canonicalUrl: string;
  readonly creator?: string;
  readonly caption?: string;
  readonly thumbnailUrl?: string;
  readonly durationSeconds?: number;
  readonly progressSeconds: number;
  readonly watchedAt: number;
  readonly watchSessionId: string;
}

export interface HistoryService {
  recordProgress(input: WatchProgressInput): Promise<void>;
  getResumePosition(videoId: string): Promise<number | null>;
  listHistory(query: HistoryQuery): Promise<readonly WatchHistoryEntry[]>;
  removeHistory(videoId: string): Promise<void>;
  clearHistory(): Promise<void>;
  getLastSession(): Promise<WatchSession | null>;
}

/** URL identity is checked separately by the TikTok-aware external boundary. */
export function isWatchProgressInput(value: unknown): value is WatchProgressInput {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'videoId' in value &&
    isBoundedString(value.videoId) &&
    'canonicalUrl' in value &&
    isSafeHttpsUrl(value.canonicalUrl) &&
    (!('creator' in value) || isBoundedString(value.creator, 256)) &&
    (!('caption' in value) ||
      (typeof value.caption === 'string' && value.caption.length <= 4_000)) &&
    (!('thumbnailUrl' in value) || isSafeHttpsUrl(value.thumbnailUrl)) &&
    (!('durationSeconds' in value) ||
      (isNonnegativeFinite(value.durationSeconds) && value.durationSeconds > 0)) &&
    'progressSeconds' in value &&
    isNonnegativeFinite(value.progressSeconds) &&
    'watchedAt' in value &&
    isTimestamp(value.watchedAt) &&
    'watchSessionId' in value &&
    isBoundedString(value.watchSessionId)
  );
}

export function createHistoryService(
  history: HistoryRepository,
  settingsRepository: SettingsRepository,
  session: SessionRepository,
  now: () => number = Date.now,
): HistoryService {
  // The background worker is the only writer. Serialize read/update pairs across tabs.
  let pending = Promise.resolve();
  let lastPrunedAt = -Infinity;
  let lastRetentionDays: number | undefined;
  function serial<T>(action: () => Promise<T>): Promise<T> {
    const result = pending.then(action);
    pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  async function prune(settings: Settings): Promise<void> {
    const time = now();
    if (time - lastPrunedAt < 3_600_000 && settings.historyRetentionDays === lastRetentionDays)
      return;
    await history.pruneBefore(time - settings.historyRetentionDays * 86_400_000);
    const lastSession = await session.get();
    if (
      lastSession &&
      isHistoryEntryExpired(
        { lastWatchedAt: lastSession.updatedAt },
        settings.historyRetentionDays,
        time,
      )
    ) {
      await session.clear();
    }
    lastPrunedAt = time;
    lastRetentionDays = settings.historyRetentionDays;
  }
  return {
    recordProgress(input) {
      return serial(async () => {
        if (!isWatchProgressInput(input)) throw new TypeError('Invalid watch progress.');
        const settings = await settingsRepository.get();
        if (!settings.historyEnabled) return;
        const time = now();
        // Accept minor clock/message skew, never persist arbitrary future timestamps.
        if (input.watchedAt > time + 60_000) throw new TypeError('Invalid watch timestamp.');
        await prune(settings);
        if (
          isHistoryEntryExpired(
            { lastWatchedAt: input.watchedAt },
            settings.historyRetentionDays,
            time,
          )
        )
          return;
        const previous = await history.get(input.videoId);
        if (previous && input.watchedAt < previous.lastWatchedAt) return;
        const duration = input.durationSeconds ?? previous?.durationSeconds ?? null;
        const progressSeconds = clampPlaybackPosition(input.progressSeconds, duration);
        const progressPercent = getPlaybackProgressPercent(progressSeconds, duration);
        const seenSessions =
          previous?.recentSessionIds ?? (previous?.lastSessionId ? [previous.lastSessionId] : []);
        const alreadyCounted = seenSessions.includes(input.watchSessionId);
        const recentSessionIds = [
          ...seenSessions.filter((id) => id !== input.watchSessionId),
          input.watchSessionId,
        ].slice(-20);
        const entry: WatchHistoryEntry = {
          ...(previous ?? {}),
          videoId: input.videoId,
          canonicalUrl: input.canonicalUrl,
          ...(input.creator !== undefined ? { creator: input.creator } : {}),
          ...(input.caption !== undefined ? { caption: input.caption } : {}),
          ...(input.thumbnailUrl !== undefined ? { thumbnailUrl: input.thumbnailUrl } : {}),
          ...(duration !== null ? { durationSeconds: duration } : {}),
          progressSeconds,
          ...(progressPercent !== null ? { progressPercent } : {}),
          firstWatchedAt: previous?.firstWatchedAt ?? input.watchedAt,
          lastWatchedAt: input.watchedAt,
          watchCount: Math.min(
            Number.MAX_SAFE_INTEGER,
            (previous?.watchCount ?? 0) + (alreadyCounted ? 0 : 1),
          ),
          completed:
            isPlaybackCompleted(progressSeconds, duration) ||
            (previous?.lastSessionId === input.watchSessionId && previous.completed),
          lastSessionId: input.watchSessionId,
          recentSessionIds,
        };
        await history.upsert(entry);
        const savedSession = await session.get();
        if (!savedSession || savedSession.updatedAt <= input.watchedAt) {
          await session.set({
            videoId: input.videoId,
            canonicalUrl: input.canonicalUrl,
            positionSeconds: progressSeconds,
            updatedAt: input.watchedAt,
          });
        }
      });
    },
    getResumePosition(videoId) {
      return serial(async () => {
        const settings = await settingsRepository.get();
        if (!settings.historyEnabled || !settings.resumePlaybackEnabled) return null;
        const entry = await history.get(videoId);
        if (!entry || isHistoryEntryExpired(entry, settings.historyRetentionDays, now()))
          return null;
        return getResumablePosition(
          entry.progressSeconds,
          entry.durationSeconds ?? null,
          entry.completed,
        );
      });
    },
    listHistory(query) {
      return serial(async () => {
        const settings = await settingsRepository.get();
        await prune(settings);
        return history.list(query);
      });
    },
    removeHistory(videoId) {
      return serial(async () => {
        await history.remove(videoId);
        if ((await session.get())?.videoId === videoId) await session.clear();
      });
    },
    clearHistory() {
      return serial(async () => {
        await history.clear();
        await session.clear();
      });
    },
    getLastSession() {
      return serial(async () => {
        const settings = await settingsRepository.get();
        await prune(settings);
        const lastSession = await session.get();
        if (!lastSession || !(await history.get(lastSession.videoId))) return null;
        return lastSession;
      });
    },
  };
}
