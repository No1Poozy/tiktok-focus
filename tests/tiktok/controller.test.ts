import { afterEach, describe, expect, it, vi } from 'vitest';
import { startTikTokController } from '../../src/tiktok/controller';
import type { TikTokAdapter } from '../../src/tiktok/adapter';
import type { ActiveTikTokVideo } from '../../src/tiktok/active-video';
import { DEFAULT_SETTINGS, type Settings } from '../../src/domain/settings/settings';

const controls = vi.hoisted(() => ({
  update: vi.fn(),
  showError: vi.fn(),
  showStatus: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('../../src/tiktok/playback-controls', () => ({ createPlaybackControls: () => controls }));
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const stop of cleanups.splice(0)) stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

async function setup(
  options: {
    resume?: Promise<number | null>;
    ready?: number;
    history?: boolean;
    paused?: boolean;
  } = {},
) {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  let settings: Settings = {
    ...DEFAULT_SETTINGS,
    historyEnabled: options.history ?? true,
    resumePlaybackEnabled: true,
  };
  const mediaTarget = new EventTarget();
  const dispatchEvent = mediaTarget.dispatchEvent.bind(mediaTarget);
  // Browser-generated media events are trusted; Node's EventTarget does not model that.
  mediaTarget.dispatchEvent = (event) => {
    Object.defineProperty(event, 'isTrusted', { value: true });
    return dispatchEvent(event);
  };
  const media = Object.assign(mediaTarget, {
    currentTime: 0,
    duration: 60,
    paused: options.paused ?? false,
    ended: false,
    readyState: options.ready ?? 1,
  });
  const active: ActiveTikTokVideo = {
    element: media as unknown as HTMLVideoElement,
    identity: {
      videoId: '123',
      canonicalUrl: 'https://www.tiktok.com/@fixture/video/123',
      creator: 'fixture',
    },
  };
  let selected: ActiveTikTokVideo | null = active;
  let notifySettings = (): void => {};
  let notifyVideo: (video: ActiveTikTokVideo | null) => void = () => {};
  const adapter: TikTokAdapter = {
    signal: new AbortController().signal,
    getVideoIdentity: () => active.identity,
    getActiveVideo: () => selected,
    getVideoElement: () => selected?.element ?? null,
    extractMetadata: () => ({ durationSeconds: 60 }),
    observeActiveVideo: vi.fn((callback: (video: ActiveTikTokVideo | null) => void) => {
      notifyVideo = callback;
      callback(active);
      return vi.fn();
    }),
    observeNavigation: () => vi.fn(),
    dispose: vi.fn(),
  };
  const ports = {
    getSettings: () => Promise.resolve(settings),
    observeSettings: (callback: () => void) => {
      notifySettings = callback;
      return vi.fn();
    },
    recordProgress: vi.fn(() => Promise.resolve()),
    getResumePosition: vi.fn(() => options.resume ?? Promise.resolve(null)),
  };
  const stop = startTikTokController(adapter, ports);
  cleanups.push(stop);
  await settle();
  return {
    media,
    active,
    adapter,
    ports,
    stop,
    dispatchUntrustedMediaEvent: (type: string) => dispatchEvent(new Event(type)),
    updateSettings: async (patch: Partial<Settings>) => {
      settings = { ...settings, ...patch };
      notifySettings();
      await settle();
    },
    switchVideo: (next: ActiveTikTokVideo | null, notify = true) => {
      selected = next;
      if (notify) notifyVideo(next);
    },
  };
}

describe('media tracking lifecycle', () => {
  it('ignores page-dispatched media events', async () => {
    const { media, ports, dispatchUntrustedMediaEvent } = await setup();
    media.currentTime = 20;
    for (const type of ['play', 'timeupdate', 'pause', 'ended', 'seeked']) {
      dispatchUntrustedMediaEvent(type);
    }
    expect(ports.recordProgress).not.toHaveBeenCalled();
  });

  it('saves silently and clears a persistence error only after a successful retry', async () => {
    const { media, ports } = await setup();
    ports.recordProgress.mockRejectedValueOnce(new Error('Storage unavailable'));
    media.currentTime = 20;
    media.dispatchEvent(new Event('seeked'));
    await settle();
    expect(controls.showError).toHaveBeenLastCalledWith('Could not save watch progress.');
    controls.showStatus.mockClear();
    let acknowledge: () => void = () => {};
    ports.recordProgress.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        acknowledge = resolve;
      }),
    );
    media.currentTime = 32;
    media.dispatchEvent(new Event('seeking'));
    media.dispatchEvent(new Event('seeked'));
    expect(ports.recordProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ progressSeconds: 32 }),
    );
    expect(controls.showStatus).not.toHaveBeenCalled();
    acknowledge();
    await settle();
    expect(controls.showStatus).toHaveBeenLastCalledWith('');
    controls.showStatus.mockClear();
    ports.recordProgress.mockRejectedValueOnce(new Error('Storage unavailable'));
    media.currentTime = 40;
    media.dispatchEvent(new Event('seeked'));
    await settle();
    expect(controls.showStatus).not.toHaveBeenCalled();
    expect(controls.showError).toHaveBeenLastCalledWith('Could not save watch progress.');
  });
  it('explains disabled tracking and missing video identity', async () => {
    const context = await setup({ history: false });
    expect(controls.showStatus).toHaveBeenLastCalledWith('History is off — progress is not saved.');
    await context.updateSettings({ historyEnabled: true });
    context.switchVideo({ ...context.active, identity: null });
    expect(controls.showError).toHaveBeenLastCalledWith(
      'Video not identified — progress is not saved.',
    );
    context.media.currentTime = 30;
    context.media.dispatchEvent(new Event('seeked'));
    expect(context.ports.recordProgress).not.toHaveBeenCalled();
  });
  it('saves a completed seek immediately within the playback throttle window', async () => {
    const { media, ports } = await setup();
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    media.currentTime = 5;
    media.dispatchEvent(new Event('timeupdate'));
    media.currentTime = 32;
    media.dispatchEvent(new Event('seeking'));
    media.dispatchEvent(new Event('timeupdate'));
    expect(ports.recordProgress).toHaveBeenCalledTimes(1);
    media.dispatchEvent(new Event('seeked'));
    expect(ports.recordProgress).toHaveBeenCalledTimes(2);
    expect(ports.recordProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ progressSeconds: 32 }),
    );
  });
  it('saves a paused seek and does not let a delayed resume override it', async () => {
    let resolveResume: (value: number | null) => void = () => {};
    const resume = new Promise<number | null>((resolve) => {
      resolveResume = resolve;
    });
    const { media, ports } = await setup({ paused: true, resume });
    media.currentTime = 28;
    media.dispatchEvent(new Event('seeking'));
    media.dispatchEvent(new Event('seeked'));
    expect(ports.recordProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ progressSeconds: 28 }),
    );
    resolveResume(12);
    await settle();
    expect(media.currentTime).toBe(28);
  });
  it('does not save completed seeks without consent or after disposal', async () => {
    const { media, ports, stop, updateSettings } = await setup({ history: false });
    media.currentTime = 20;
    media.dispatchEvent(new Event('seeking'));
    media.dispatchEvent(new Event('seeked'));
    expect(ports.recordProgress).not.toHaveBeenCalled();
    await updateSettings({ historyEnabled: true });
    stop();
    media.dispatchEvent(new Event('seeked'));
    expect(ports.recordProgress).not.toHaveBeenCalled();
  });
  it('restores after a slow lookup without saving early autoplay over the old position', async () => {
    let resolveResume: (value: number | null) => void = () => {};
    const resume = new Promise<number | null>((resolve) => {
      resolveResume = resolve;
    });
    const { media, ports } = await setup({ resume });
    media.currentTime = 4;
    media.dispatchEvent(new Event('timeupdate'));
    expect(ports.recordProgress).not.toHaveBeenCalled();
    resolveResume(24);
    await settle();
    expect(media.currentTime).toBe(24);
    media.dispatchEvent(new Event('pause'));
    expect(ports.recordProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ progressSeconds: 24 }),
    );
  });
  it('retains the last trusted position across late events from a recycled player', async () => {
    const context = await setup();
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    context.media.currentTime = 5;
    context.media.dispatchEvent(new Event('timeupdate'));
    context.media.currentTime = 9;
    context.media.dispatchEvent(new Event('timeupdate'));
    const next = {
      ...context.active,
      identity: {
        videoId: '456',
        canonicalUrl: 'https://www.tiktok.com/@fixture/video/456',
        creator: 'fixture',
      },
    };
    context.switchVideo(next, false);
    context.media.currentTime = 0;
    context.media.dispatchEvent(new Event('pause'));
    context.switchVideo(next);
    expect(context.ports.recordProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ videoId: '123', progressSeconds: 9 }),
    );
  });
  it('retries restoring on canplay if the first seek is not ready', async () => {
    const { media, ports } = await setup({ ready: 0, resume: Promise.resolve(18) });
    let position = 0;
    let ready = false;
    Object.defineProperty(media, 'currentTime', {
      configurable: true,
      get: () => position,
      set: (next: number) => {
        if (!ready) throw new Error('Media is not seekable yet');
        position = next;
      },
    });
    media.readyState = 1;
    media.dispatchEvent(new Event('loadedmetadata'));
    media.dispatchEvent(new Event('timeupdate'));
    expect(ports.recordProgress).not.toHaveBeenCalled();
    ready = true;
    media.dispatchEvent(new Event('canplay'));
    expect(media.currentTime).toBe(18);
  });
  it('does not record without consent', async () => {
    const context = await setup({ history: false });
    context.media.currentTime = 8;
    context.media.dispatchEvent(new Event('timeupdate'));
    context.media.dispatchEvent(new Event('pause'));
    expect(context.ports.recordProgress).not.toHaveBeenCalled();
  });
  it('throttles hot progress events and flushes the latest sample on pause', async () => {
    const { media, ports } = await setup();
    const time = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    media.currentTime = 5;
    media.dispatchEvent(new Event('timeupdate'));
    media.currentTime = 6;
    media.dispatchEvent(new Event('timeupdate'));
    expect(ports.recordProgress).toHaveBeenCalledTimes(1);
    time.mockReturnValue(15_000);
    media.currentTime = 10;
    media.dispatchEvent(new Event('timeupdate'));
    expect(ports.recordProgress).toHaveBeenCalledTimes(2);
    media.currentTime = 11;
    media.dispatchEvent(new Event('pause'));
    expect(ports.recordProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ progressSeconds: 11, videoId: '123' }),
    );
  });
  it('does not apply a delayed resume after the user turns it off', async () => {
    let resolveResume: (value: number | null) => void = () => {};
    const resume = new Promise<number | null>((resolve) => {
      resolveResume = resolve;
    });
    const context = await setup({ resume });
    await context.updateSettings({ resumePlaybackEnabled: false });
    resolveResume(12);
    await settle();
    expect(context.media.currentTime).toBe(0);
  });
  it('waits for metadata before restoring and never overwrites saved progress with zero', async () => {
    const { media, ports } = await setup({ ready: 0, resume: Promise.resolve(12) });
    media.dispatchEvent(new Event('timeupdate'));
    expect(ports.recordProgress).not.toHaveBeenCalled();
    media.readyState = 1;
    media.dispatchEvent(new Event('loadedmetadata'));
    expect(media.currentTime).toBe(12);
    media.dispatchEvent(new Event('timeupdate'));
    expect(ports.recordProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ progressSeconds: 12 }),
    );
  });
  it('does not seek after disposal or after the user seeks', async () => {
    let resolveResume: (value: number | null) => void = () => {};
    const resume = new Promise<number | null>((resolve) => {
      resolveResume = resolve;
    });
    const context = await setup({ resume });
    context.media.currentTime = 1;
    context.media.dispatchEvent(new Event('seeking'));
    resolveResume(12);
    await settle();
    expect(context.media.currentTime).toBe(1);
    context.stop();
    context.media.dispatchEvent(new Event('pause'));
    expect(controls.dispose).toHaveBeenCalledTimes(1);
    expect(context.ports.recordProgress).not.toHaveBeenCalled();
  });
  it('does not attribute recycled media to the previous video before observation catches up', async () => {
    const context = await setup();
    context.switchVideo(
      {
        ...context.active,
        identity: {
          videoId: '456',
          canonicalUrl: 'https://www.tiktok.com/@fixture/video/456',
          creator: 'fixture',
        },
      },
      false,
    );
    context.media.currentTime = 15;
    context.media.dispatchEvent(new Event('timeupdate'));
    expect(context.ports.recordProgress).not.toHaveBeenCalled();
  });
  it('flushes a valid previous sample when the document becomes hidden', async () => {
    const context = await setup();
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    context.media.currentTime = 5;
    context.media.dispatchEvent(new Event('timeupdate'));
    context.media.currentTime = 6;
    context.media.dispatchEvent(new Event('timeupdate'));
    context.switchVideo(null, false);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(context.ports.recordProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ progressSeconds: 6 }),
    );
  });
});
