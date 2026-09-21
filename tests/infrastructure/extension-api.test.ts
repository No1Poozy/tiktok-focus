import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createExtensionStorage,
  getExtensionStatus,
  openHistoryPage,
  openOptionsPage,
  registerBackgroundMessages,
} from '../../src/infrastructure/chrome/extension-api';
import { MESSAGE_TYPES } from '../../src/infrastructure/messaging/messages';

type MessageListener = (
  message: unknown,
  sender: { readonly id?: string },
  sendResponse: (response: unknown) => void,
) => void;

const platform = vi.hoisted(() => ({
  extensionId: 'test-extension-id',
  storageGet: vi.fn<(key: string) => Promise<Record<string, unknown>>>(),
  storageSet: vi.fn<(items: Record<string, unknown>) => Promise<void>>(),
  storageRemove: vi.fn<(key: string) => Promise<void>>(),
  getURL: vi.fn<(path: string) => string>(),
  tabsCreate: vi.fn<(options: { url: string }) => Promise<void>>(),
  openOptionsPage: vi.fn<() => Promise<void>>(),
  sendMessage: vi.fn<(message: unknown) => Promise<unknown>>(),
  getManifest: vi.fn<() => { version: string }>(),
  addListener: vi.fn<(listener: MessageListener) => void>(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: platform.storageGet,
        set: platform.storageSet,
        remove: platform.storageRemove,
      },
    },
    tabs: { create: platform.tabsCreate },
    runtime: {
      id: platform.extensionId,
      getURL: platform.getURL,
      openOptionsPage: platform.openOptionsPage,
      sendMessage: platform.sendMessage,
      getManifest: platform.getManifest,
      onMessage: { addListener: platform.addListener },
    },
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  platform.storageGet.mockResolvedValue({});
  platform.storageSet.mockResolvedValue(undefined);
  platform.storageRemove.mockResolvedValue(undefined);
  platform.getURL.mockImplementation((path) => `chrome-extension://${platform.extensionId}${path}`);
  platform.tabsCreate.mockResolvedValue(undefined);
  platform.openOptionsPage.mockResolvedValue(undefined);
  platform.sendMessage.mockResolvedValue({ version: '0.1.0' });
  platform.getManifest.mockReturnValue({ version: '0.1.0' });
});

function getRegisteredListener(index = 0): MessageListener {
  const listener = platform.addListener.mock.calls[index]?.[0];
  if (!listener) throw new Error('No background listener was registered.');
  return listener;
}

describe('extension storage boundary', () => {
  it('unwraps only the requested value without pretending to validate its payload', async () => {
    const value = { arbitrary: ['untrusted', 42] };
    platform.storageGet.mockResolvedValue({ settings: value, unrelated: 'ignore' });
    const storage = createExtensionStorage();

    expect(await storage.get('settings')).toBe(value);
    expect(platform.storageGet).toHaveBeenCalledWith('settings');
    expect(await storage.get('missing')).toBeUndefined();
  });

  it('wraps writes and forwards removals to the requested local storage key', async () => {
    const storage = createExtensionStorage();
    const value = { schemaVersion: 1, data: 'payload' };
    await storage.set('settings', value);
    await storage.remove('settings');

    expect(platform.storageSet).toHaveBeenCalledWith({ settings: value });
    expect(platform.storageRemove).toHaveBeenCalledWith('settings');
  });

  it('propagates platform read, write, and removal failures', async () => {
    const failure = new Error('Storage unavailable');
    platform.storageGet.mockRejectedValue(failure);
    platform.storageSet.mockRejectedValue(failure);
    platform.storageRemove.mockRejectedValue(failure);
    const storage = createExtensionStorage();

    await expect(storage.get('settings')).rejects.toBe(failure);
    await expect(storage.set('settings', {})).rejects.toBe(failure);
    await expect(storage.remove('settings')).rejects.toBe(failure);
  });
});

describe('extension page navigation', () => {
  it('opens the bundled history page using an extension URL', async () => {
    await openHistoryPage();

    expect(platform.getURL).toHaveBeenCalledWith('/history.html');
    expect(platform.tabsCreate).toHaveBeenCalledWith({
      url: `chrome-extension://${platform.extensionId}/history.html`,
    });
  });

  it('delegates settings navigation to the browser options API', async () => {
    await openOptionsPage();
    expect(platform.openOptionsPage).toHaveBeenCalledOnce();
    expect(platform.tabsCreate).not.toHaveBeenCalled();
  });

  it('propagates navigation failures so UI callers can report them', async () => {
    const failure = new Error('Navigation unavailable');
    platform.tabsCreate.mockRejectedValue(failure);
    platform.openOptionsPage.mockRejectedValue(failure);

    await expect(openHistoryPage()).rejects.toBe(failure);
    await expect(openOptionsPage()).rejects.toBe(failure);
  });
});

describe('extension status request', () => {
  it('sends the centralized request and returns validated status', async () => {
    expect(await getExtensionStatus()).toEqual({ version: '0.1.0' });
    expect(platform.sendMessage).toHaveBeenCalledWith({ type: MESSAGE_TYPES.getStatus });
  });

  it.each(
    [
      undefined,
      null,
      false,
      '0.1.0',
      [],
      {},
      { version: 1 },
      { version: '' },
      { version: 'not-a-version' },
      { version: '1.2.3.4.5' },
    ].map((response) => ({ response })),
  )('rejects malformed worker status %#', async ({ response }) => {
    platform.sendMessage.mockResolvedValue(response);
    await expect(getExtensionStatus()).rejects.toThrow('invalid status');
  });

  it('propagates runtime messaging failures', async () => {
    const failure = new Error('Receiving end does not exist');
    platform.sendMessage.mockRejectedValue(failure);
    await expect(getExtensionStatus()).rejects.toBe(failure);
  });
});

describe('background message registration', () => {
  it('registers synchronously and responds to a recognized same-extension request', () => {
    registerBackgroundMessages();
    expect(platform.addListener).toHaveBeenCalledOnce();
    const respond = vi.fn<(response: unknown) => void>();

    getRegisteredListener()(
      { type: MESSAGE_TYPES.getStatus },
      { id: platform.extensionId },
      respond,
    );

    expect(respond).toHaveBeenCalledExactlyOnceWith({ version: '0.1.0' });
  });

  it.each([undefined, null, 'extension:get-status', {}, { type: 'unknown' }])(
    'ignores an unrecognized message %#',
    (message) => {
      registerBackgroundMessages();
      const respond = vi.fn<(response: unknown) => void>();
      getRegisteredListener()(message, { id: platform.extensionId }, respond);

      expect(respond).not.toHaveBeenCalled();
      expect(platform.getManifest).not.toHaveBeenCalled();
    },
  );

  it.each([{}, { id: 'another-extension' }])(
    'ignores a sender outside this extension %#',
    (sender) => {
      registerBackgroundMessages();
      const respond = vi.fn<(response: unknown) => void>();
      getRegisteredListener()({ type: MESSAGE_TYPES.getStatus }, sender, respond);

      expect(respond).not.toHaveBeenCalled();
      expect(platform.getManifest).not.toHaveBeenCalled();
    },
  );

  it('answers from manifest metadata on each worker registration without storage or saved state', () => {
    const respond = vi.fn<(response: unknown) => void>();
    registerBackgroundMessages();
    getRegisteredListener()(
      { type: MESSAGE_TYPES.getStatus },
      { id: platform.extensionId },
      respond,
    );
    expect(respond).toHaveBeenLastCalledWith({ version: '0.1.0' });

    // A subsequent worker starts with a new listener and reads its own manifest.
    platform.getManifest.mockReturnValue({ version: '0.2.0' });
    registerBackgroundMessages();
    getRegisteredListener(1)(
      { type: MESSAGE_TYPES.getStatus },
      { id: platform.extensionId },
      respond,
    );

    expect(respond).toHaveBeenLastCalledWith({ version: '0.2.0' });
    expect(platform.storageGet).not.toHaveBeenCalled();
    expect(platform.storageSet).not.toHaveBeenCalled();
  });
});
