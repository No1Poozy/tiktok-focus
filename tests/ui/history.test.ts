import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WatchHistoryEntry } from '../../src/domain/history/history-entry';
import { createDefaultSettings } from '../../src/domain/settings/settings';
import { initializeHistory, type HistoryActions } from '../../src/ui/pages/history';

afterEach(() => {
  vi.unstubAllGlobals();
});

function createPage() {
  const html = readFileSync(
    new URL('../../src/entrypoints/history/index.html', import.meta.url),
    'utf8',
  );
  const { document, window } = parseHTML(html);
  vi.stubGlobal('document', document);
  vi.stubGlobal('HTMLButtonElement', window.HTMLButtonElement);
  return document;
}

function entry(videoId = '100'): WatchHistoryEntry {
  return {
    videoId,
    canonicalUrl: `https://www.tiktok.com/@creator/video/${videoId}`,
    creator: 'creator',
    caption: '<img src=x onerror=alert(1)>',
    progressSeconds: 12,
    durationSeconds: 60,
    progressPercent: 20,
    firstWatchedAt: 1_700_000_000_000,
    lastWatchedAt: 1_700_000_000_000,
    watchCount: 1,
    completed: false,
  };
}

function setupActions(overrides: Partial<HistoryActions> = {}): HistoryActions {
  return {
    openSettings: vi.fn().mockResolvedValue(undefined),
    listHistory: vi.fn().mockResolvedValue([entry()]),
    removeHistory: vi.fn().mockResolvedValue(undefined),
    clearHistory: vi.fn().mockResolvedValue(undefined),
    confirm: vi.fn().mockReturnValue(true),
    ...overrides,
  };
}

function repository() {
  return { get: vi.fn().mockResolvedValue(createDefaultSettings()), set: vi.fn() };
}

describe('watch history page', () => {
  it('renders untrusted captions as text and opens canonical links without opener access', async () => {
    const document = createPage();
    initializeHistory(repository(), setupActions());
    await vi.waitFor(() => expect(document.querySelectorAll('.history-entry')).toHaveLength(1));

    const title = document.querySelector<HTMLAnchorElement>('.history-title');
    expect(title?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(document.querySelector('#history-list img')).toBeNull();
    expect(title?.href).toBe(entry().canonicalUrl);
    expect(title?.rel).toBe('noopener noreferrer');
    expect(document.getElementById('recording-status')?.textContent).toContain('Recording is off');
  });

  it('requires confirmation before clearing and leaves entries visible when deletion fails', async () => {
    const document = createPage();
    const confirm = vi.fn().mockReturnValue(false);
    const clearHistory = vi.fn().mockRejectedValue(new Error('Storage failed'));
    initializeHistory(repository(), setupActions({ confirm, clearHistory }));
    await vi.waitFor(() => expect(document.querySelectorAll('.history-entry')).toHaveLength(1));
    const clear = document.getElementById('clear-history');

    clear?.click();
    expect(clearHistory).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    clear?.click();
    await vi.waitFor(() => expect(clearHistory).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(document.getElementById('history-status')?.textContent).toContain('Could not clear'),
    );
    expect(document.querySelectorAll('.history-entry')).toHaveLength(1);
  });

  it('uses the timestamp and video ID together when paging tied timestamps', async () => {
    const document = createPage();
    const page = Array.from({ length: 100 }, (_, index) => entry(String(300 - index)));
    const listHistory = vi
      .fn()
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce([entry('200')]);
    initializeHistory(repository(), setupActions({ listHistory }));
    await vi.waitFor(() => expect(document.querySelectorAll('.history-entry')).toHaveLength(100));

    document.getElementById('load-more')?.click();
    await vi.waitFor(() => expect(document.querySelectorAll('.history-entry')).toHaveLength(101));

    expect(listHistory).toHaveBeenLastCalledWith({
      limit: 100,
      before: 1_700_000_000_000,
      beforeVideoId: '201',
    });
    expect(document.getElementById('load-more')?.hidden).toBe(true);
  });
});
