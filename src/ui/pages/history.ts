import type { HistoryQuery } from '../../application/ports/history-repository';
import type { SettingsRepository } from '../../application/ports/settings-repository';
import type { WatchHistoryEntry } from '../../domain/history/history-entry';
import { bindNavigation } from './navigation';

export interface HistoryActions {
  openSettings: () => Promise<void>;
  listHistory: (query: HistoryQuery) => Promise<readonly WatchHistoryEntry[]>;
  removeHistory: (videoId: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  confirm: (message: string) => boolean;
}

const PAGE_SIZE = 100;

export function initializeHistory(repository: SettingsRepository, actions: HistoryActions): void {
  const settings = document.getElementById('open-settings');
  const navigationStatus = document.getElementById('navigation-status');
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  const emptyDescription = document.getElementById('empty-description');
  const status = document.getElementById('history-status');
  const recordingStatus = document.getElementById('recording-status');
  const refresh = document.getElementById('refresh-history');
  const clear = document.getElementById('clear-history');
  const more = document.getElementById('load-more');

  if (
    !(settings instanceof HTMLButtonElement) ||
    !navigationStatus ||
    !list ||
    !empty ||
    !emptyDescription ||
    !status ||
    !recordingStatus ||
    !(refresh instanceof HTMLButtonElement) ||
    !(clear instanceof HTMLButtonElement) ||
    !(more instanceof HTMLButtonElement)
  ) {
    throw new Error('History is missing required page elements.');
  }

  const elements = { list, empty, emptyDescription, status, recordingStatus, refresh, clear, more };
  let entries: readonly WatchHistoryEntry[] = [];
  let cursor: WatchHistoryEntry | undefined;
  let hasMore = false;
  let busy = false;
  let loaded = false;
  let recording: boolean | undefined;

  bindNavigation(settings, actions.openSettings, navigationStatus);

  function setBusy(value: boolean): void {
    busy = value;
    elements.list.setAttribute('aria-busy', String(value));
    elements.refresh.disabled = value;
    elements.clear.disabled = value || entries.length === 0;
    elements.more.disabled = value;
    for (const button of elements.list.querySelectorAll('button')) button.disabled = value;
  }

  function announce(message: string, isError = false): void {
    elements.status.textContent = message;
    elements.status.classList.toggle('is-error', isError);
  }

  function render(): void {
    elements.list.replaceChildren(...entries.map(createEntry));
    elements.empty.hidden = !loaded || entries.length > 0;
    elements.emptyDescription.textContent =
      recording === false
        ? 'Enable Watch History in Settings, then play a TikTok video to start your history.'
        : 'Play a TikTok video with Watch History enabled. Watched videos will appear here.';
    elements.more.hidden = !hasMore;
    setBusy(busy);
  }

  async function load(append: boolean): Promise<void> {
    if (busy) return;
    setBusy(true);
    announce('Loading history...');
    const query: HistoryQuery =
      append && cursor
        ? { limit: PAGE_SIZE, before: cursor.lastWatchedAt, beforeVideoId: cursor.videoId }
        : { limit: PAGE_SIZE };

    try {
      const [page, preferences] = await Promise.all([
        actions.listHistory(query),
        repository.get().catch(() => undefined),
      ]);
      recording = preferences?.historyEnabled;
      elements.recordingStatus.textContent =
        recording === true
          ? 'Recording watched videos on this device.'
          : recording === false
            ? 'Recording is off. Enable Watch History in Settings to save videos.'
            : 'Recording preference unavailable. Check Settings to try again.';
      const previous = append ? entries : [];
      const seen = new Set(previous.map((entry) => entry.videoId));
      entries = [...previous, ...page.filter((entry) => !seen.has(entry.videoId))];
      cursor = page.at(-1);
      hasMore = page.length === PAGE_SIZE;
      loaded = true;
      render();
      announce(
        entries.length === 0
          ? 'No saved videos.'
          : `${String(entries.length)} ${entries.length === 1 ? 'video' : 'videos'} shown. Newest first.`,
      );
    } catch {
      announce(
        'Could not load history. Your saved data has been kept. Select Refresh to retry.',
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(entry: WatchHistoryEntry): Promise<void> {
    if (busy || !actions.confirm('Remove this video from your watch history?')) return;
    setBusy(true);
    announce('Removing video...');
    try {
      await actions.removeHistory(entry.videoId);
      entries = entries.filter((item) => item.videoId !== entry.videoId);
      render();
      announce('Video removed from history.');
    } catch {
      announce('Could not remove this video. Please try again.', true);
    } finally {
      setBusy(false);
    }
  }

  function createEntry(entry: WatchHistoryEntry): HTMLLIElement {
    const row = document.createElement('li');
    row.className = 'panel history-entry';
    const content = document.createElement('div');
    content.className = 'history-copy';
    const title = document.createElement('a');
    title.className = 'history-title';
    title.textContent =
      entry.caption || (entry.creator ? `Video by @${entry.creator}` : 'TikTok video');
    title.href = entry.canonicalUrl;
    title.target = '_blank';
    title.rel = 'noopener noreferrer';
    content.append(title);

    if (entry.creator) {
      const creator = document.createElement('p');
      creator.className = 'muted';
      creator.textContent = `@${entry.creator}`;
      content.append(creator);
    }

    const watched = document.createElement('time');
    const watchedDate = new Date(entry.lastWatchedAt);
    watched.dateTime = watchedDate.toISOString();
    watched.className = 'muted history-time';
    watched.textContent = `Last watched ${watchedDate.toLocaleString()}`;
    content.append(watched);

    const progressText = document.createElement('p');
    progressText.className = 'muted history-progress-text';
    const duration = entry.durationSeconds;
    progressText.textContent = `${entry.completed ? 'Completed · ' : ''}${formatDuration(entry.progressSeconds)}${duration === undefined ? ' watched' : ` / ${formatDuration(duration)}`}`;
    content.append(progressText);
    if (entry.progressPercent !== undefined) {
      const progress = document.createElement('progress');
      progress.max = 100;
      progress.value = entry.progressPercent;
      progress.setAttribute('aria-label', 'Video progress');
      content.append(progress);
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'history-remove';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${title.textContent} from history`);
    remove.addEventListener('click', () => {
      void removeEntry(entry);
    });
    row.append(content, remove);
    return row;
  }

  refresh.addEventListener('click', () => {
    void load(false);
  });
  more.addEventListener('click', () => {
    void load(true);
  });
  clear.addEventListener('click', () => {
    if (
      busy ||
      !actions.confirm('Clear all watch history on this device? This cannot be undone.')
    ) {
      return;
    }
    setBusy(true);
    announce('Clearing history...');
    void actions
      .clearHistory()
      .then(() => {
        entries = [];
        cursor = undefined;
        hasMore = false;
        render();
        announce('Watch history cleared.');
      })
      .catch(() => {
        announce('Could not clear history. Please try again.', true);
      })
      .finally(() => {
        setBusy(false);
      });
  });

  void load(false);
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const remainder = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, '0')}:${remainder}`
    : `${String(minutes)}:${remainder}`;
}
