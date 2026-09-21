import type { WatchProgressInput } from '../application/history-service';
import { createDefaultSettings, type Settings } from '../domain/settings/settings';
import type { TikTokAdapter } from './adapter';
import type { ActiveTikTokVideo } from './active-video';
import { createPlaybackControls } from './playback-controls';

export interface TikTokControllerPorts {
  getSettings(): Promise<Settings>;
  observeSettings(listener: () => void): () => void;
  recordProgress(input: WatchProgressInput): Promise<void>;
  getResumePosition(videoId: string): Promise<number | null>;
}

/** Playback samples are throttled; completed seeks and lifecycle events flush immediately. */
export function startTikTokController(
  adapter: TikTokAdapter,
  ports: TikTokControllerPorts,
): () => void {
  const lifetime = new AbortController();
  let settings = createDefaultSettings();
  let current: ActiveTikTokVideo | null = null;
  let mediaLifetime: AbortController | null = null;
  let sample: WatchProgressInput | null = null;
  let lastSentAt = 0;
  let played = false;
  let resumePending = false;
  let sessionId = '';
  let settingsGeneration = 0;
  let cancelPendingResume = (): void => {};

  const controls = createPlaybackControls();

  function reportTracking(): void {
    if (!settings.historyEnabled) controls.showStatus('History is off — progress is not saved.');
    else if (current && !current.identity)
      controls.showError('Video not identified — progress is not saved.');
    else controls.showStatus('');
  }

  function flush(): void {
    if (!settings.historyEnabled || !sample || resumePending || lifetime.signal.aborted) return;
    const input = sample;
    sample = null;
    lastSentAt = Date.now();
    void ports
      .recordProgress(input)
      .then(() => {
        if (
          lifetime.signal.aborted ||
          input.watchSessionId !== sessionId ||
          !settings.historyEnabled
        )
          return;
        controls.showStatus('');
      })
      .catch(() => {
        if (!lifetime.signal.aborted && input.watchSessionId === sessionId)
          controls.showError('Could not save watch progress.');
      });
  }

  function capture(completedSeek = false): void {
    if (
      !current?.identity ||
      (!played && !completedSeek) ||
      !settings.historyEnabled ||
      resumePending
    )
      return;
    const detected = adapter.getActiveVideo();
    // Visibility changes can temporarily remove selection; retain the last valid sample.
    if (!detected) return;
    if (
      detected?.element !== current.element ||
      detected.identity?.videoId !== current.identity.videoId
    ) {
      // A late event from a recycled player must not erase the last trusted sample.
      return;
    }
    const position = current.element.currentTime;
    if (!Number.isFinite(position) || position < 0) return;
    sample = {
      ...current.identity,
      ...adapter.extractMetadata(current),
      progressSeconds: position,
      watchedAt: Date.now(),
      watchSessionId: sessionId,
    };
  }

  function bindVideo(video: ActiveTikTokVideo | null): void {
    // Use the last media event sample: a recycled element may already hold another video.
    flush();
    mediaLifetime?.abort();
    current = video;
    sample = null;
    lastSentAt = 0;
    sessionId = crypto.randomUUID();
    resumePending = false;
    played = false;
    controls.update(current);
    reportTracking();
    if (!video) return;
    const media = video.element;
    const session = sessionId;
    const mediaContext = new AbortController();
    mediaLifetime = mediaContext;
    const options = { signal: mediaContext.signal };
    played = !media.paused && !media.ended;
    // Decide at attachment time: a slow storage response is not a user seek.
    let userSeeked = media.currentTime > 2;
    let restorePosition: number | null = null;
    cancelPendingResume = () => {
      userSeeked = true;
      restorePosition = null;
      resumePending = false;
    };

    function restore(): void {
      if (!settings.resumePlaybackEnabled || !settings.historyEnabled || userSeeked) {
        cancelPendingResume();
        return;
      }
      if (
        restorePosition === null ||
        media.readyState < 1 ||
        !Number.isFinite(media.duration) ||
        media.duration <= 0
      )
        return;
      const position = restorePosition;
      if (mediaContext.signal.aborted || position >= media.duration - 2) {
        cancelPendingResume();
        return;
      }
      try {
        media.currentTime = Math.min(position, media.duration - 2);
        restorePosition = null;
        resumePending = false;
      } catch {
        // Keep the target for the next metadata/canplay/timeupdate event.
      }
    }

    media.addEventListener(
      'seeking',
      () => {
        cancelPendingResume();
      },
      options,
    );
    media.addEventListener('loadedmetadata', restore, options);
    media.addEventListener('canplay', restore, options);
    media.addEventListener(
      'play',
      (event) => {
        if (!event.isTrusted) return;
        played = true;
      },
      options,
    );
    media.addEventListener(
      'timeupdate',
      (event) => {
        if (!event.isTrusted) return;
        if (resumePending) restore();
        capture();
        if (Date.now() - lastSentAt >= 5_000) flush();
      },
      options,
    );
    const captureAndFlush = (event: Event): void => {
      if (!event.isTrusted) return;
      capture();
      flush();
    };
    media.addEventListener('pause', captureAndFlush, options);
    media.addEventListener('ended', captureAndFlush, options);
    media.addEventListener(
      'seeked',
      (event) => {
        // Page scripts share the DOM event surface with isolated content scripts.
        if (!event.isTrusted) return;
        // A paused scrub may produce no later play/pause event. Persist its final
        // position immediately instead of waiting for the playback throttle.
        capture(true);
        flush();
      },
      options,
    );

    if (video.identity && settings.resumePlaybackEnabled && settings.historyEnabled) {
      resumePending = true;
      void ports
        .getResumePosition(video.identity.videoId)
        .then((position) => {
          if (lifetime.signal.aborted || mediaContext.signal.aborted || session !== sessionId)
            return;
          restorePosition = position;
          restore();
        })
        .catch(() => {
          if (!lifetime.signal.aborted && session === sessionId)
            controls.showError('Could not load saved progress.');
        })
        .finally(() => {
          if (session === sessionId && restorePosition === null) resumePending = false;
        });
    }
  }

  async function reloadSettings(): Promise<void> {
    const generation = ++settingsGeneration;
    try {
      const next = await ports.getSettings();
      if (lifetime.signal.aborted || generation !== settingsGeneration) return;
      settings = next;
      if (!settings.historyEnabled) sample = null;
      if (!settings.historyEnabled || !settings.resumePlaybackEnabled) cancelPendingResume();
      controls.update(current);
      reportTracking();
    } catch {
      if (!lifetime.signal.aborted && generation === settingsGeneration) {
        // Fail closed if consent/settings cannot be validated.
        settings = createDefaultSettings();
        sample = null;
        cancelPendingResume();
        controls.update(current);
        controls.showError('Could not load settings. Reopen extension settings to retry.');
      }
    }
  }

  const stopSettings = ports.observeSettings(() => {
    void reloadSettings();
  });
  let stopVideo: (() => void) | undefined;
  void reloadSettings().then(() => {
    if (!lifetime.signal.aborted) stopVideo = adapter.observeActiveVideo(bindVideo);
  });
  const flushCurrent = (): void => {
    capture();
    flush();
  };
  window.addEventListener('pagehide', flushCurrent, { signal: lifetime.signal });
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') flushCurrent();
    },
    { signal: lifetime.signal },
  );

  return () => {
    if (lifetime.signal.aborted) return;
    flush();
    lifetime.abort();
    mediaLifetime?.abort();
    stopVideo?.();
    stopSettings();
    controls.dispose();
    adapter.dispose();
  };
}
