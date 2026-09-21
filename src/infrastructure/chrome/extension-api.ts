import { browser } from 'wxt/browser';
import type { HistoryService, WatchProgressInput } from '../../application/history-service';
import type { HistoryQuery } from '../../application/ports/history-repository';
import { isWatchHistoryEntry, type WatchHistoryEntry } from '../../domain/history/history-entry';
import { isWatchSession, type WatchSession } from '../../domain/playback/playback-state';
import type { StorageArea } from '../storage/storage-types';
import {
  isExtensionStatus,
  isStatusRequest,
  isHistoryRequest,
  isHistoryResponse,
  MESSAGE_TYPES,
  type ExtensionStatus,
  type ExtensionStatusRequest,
  type HistoryRequest,
  type HistoryResponse,
} from '../messaging/messages';

/** Adapt the platform's untrusted keyed response to a small, testable storage port. */
export function createExtensionStorage(): StorageArea {
  return {
    async get(key) {
      const values: Record<string, unknown> = await browser.storage.local.get(key);
      return values[key];
    },
    async set(key, value) {
      await browser.storage.local.set({ [key]: value });
    },
    async remove(key) {
      await browser.storage.local.remove(key);
    },
  };
}

export async function openHistoryPage(): Promise<void> {
  // Creating an extension page does not require access to users' tab data.
  await browser.tabs.create({ url: browser.runtime.getURL('/history.html') });
}

export async function openOptionsPage(): Promise<void> {
  await browser.runtime.openOptionsPage();
}

export async function getExtensionStatus(): Promise<ExtensionStatus> {
  const request: ExtensionStatusRequest = { type: MESSAGE_TYPES.getStatus };
  const response: unknown = await browser.runtime.sendMessage(request);
  if (!isExtensionStatus(response)) {
    throw new Error('The background worker returned an invalid status.');
  }
  return response;
}

/** Register synchronously on every MV3 worker start; no persistent in-memory state. */
export function registerBackgroundMessages(history?: HistoryService): void {
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return;
    if (isStatusRequest(message)) {
      const response: ExtensionStatus = { version: browser.runtime.getManifest().version };
      sendResponse(response);
      return;
    }
    if (!history || !isHistoryRequest(message)) return;
    void handleHistoryRequest(history, message).then(
      (value) => sendResponse({ ok: true, value: value ?? null } satisfies HistoryResponse),
      () =>
        sendResponse({
          ok: false,
          error: 'Local history could not be accessed. Please try again.',
        } satisfies HistoryResponse),
    );
    return true;
  });
}

async function handleHistoryRequest(
  history: HistoryService,
  request: HistoryRequest,
): Promise<unknown> {
  switch (request.type) {
    case MESSAGE_TYPES.recordProgress:
      return history.recordProgress(request.input);
    case MESSAGE_TYPES.getResumePosition:
      return history.getResumePosition(request.videoId);
    case MESSAGE_TYPES.listHistory:
      return history.listHistory(request.query);
    case MESSAGE_TYPES.removeHistory:
      return history.removeHistory(request.videoId);
    case MESSAGE_TYPES.clearHistory:
      return history.clearHistory();
    case MESSAGE_TYPES.getLastSession:
      return history.getLastSession();
  }
}

async function sendHistoryRequest(request: HistoryRequest): Promise<unknown> {
  const response: unknown = await browser.runtime.sendMessage(request);
  if (!isHistoryResponse(response)) throw new Error('Invalid history response.');
  if (!response.ok) throw new Error(response.error);
  return response.value;
}

export async function recordProgress(input: WatchProgressInput): Promise<void> {
  await sendHistoryRequest({ type: MESSAGE_TYPES.recordProgress, input });
}

export async function getResumePosition(videoId: string): Promise<number | null> {
  const value = await sendHistoryRequest({ type: MESSAGE_TYPES.getResumePosition, videoId });
  if (value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0))
    return value;
  throw new Error('Invalid resume position.');
}

export async function listHistory(query: HistoryQuery): Promise<readonly WatchHistoryEntry[]> {
  const value = await sendHistoryRequest({ type: MESSAGE_TYPES.listHistory, query });
  if (Array.isArray(value) && value.every(isWatchHistoryEntry)) return value;
  throw new Error('Invalid history entries.');
}

export async function removeHistory(videoId: string): Promise<void> {
  await sendHistoryRequest({ type: MESSAGE_TYPES.removeHistory, videoId });
}

export async function clearHistory(): Promise<void> {
  await sendHistoryRequest({ type: MESSAGE_TYPES.clearHistory });
}

export async function getLastSession(): Promise<WatchSession | null> {
  const value = await sendHistoryRequest({ type: MESSAGE_TYPES.getLastSession });
  if (value === null || isWatchSession(value)) return value;
  throw new Error('Invalid last session.');
}

export function observeSettingsChanges(listener: () => void): () => void {
  const onChanged = (changes: Record<string, unknown>, area: string): void => {
    if (area === 'local' && 'settings' in changes) listener();
  };
  browser.storage.onChanged.addListener(onChanged);
  return () => browser.storage.onChanged.removeListener(onChanged);
}
