import { createFullscreenPlayer } from '../ui/components/fullscreen-player';
import type { ActiveTikTokVideo } from './active-video';

export interface FullscreenSession {
  readonly video: HTMLVideoElement;
  readonly videoId: string | null;
  showStatus(message: string, error?: boolean): void;
  dispose(): void;
}

/** Owns one fullscreen request and restores every temporary DOM change on exit. */
export function startFullscreenSession(
  active: ActiveTikTokVideo,
  callbacks: { onClose(): void; onError(message: string): void },
): FullscreenSession {
  const video = active.element;
  const doc = video.ownerDocument;
  const root = video.parentElement;
  if (
    !video.isConnected ||
    !root ||
    root === doc.body ||
    root === doc.documentElement ||
    root.querySelectorAll('video').length !== 1
  )
    throw new Error('This player layout cannot open fullscreen.');
  const lifetime = new AbortController();
  const previousControls = video.controls;
  const previousRootMarker = root.getAttribute('data-tiktok-fullscreen-root');
  const previousVideoMarker = video.getAttribute('data-tiktok-fullscreen-video');
  const previousFocus = doc.activeElement;
  let entered = false;
  const style = doc.createElement('style');
  style.dataset.tiktokFocusOwned = '';
  style.textContent = `
    [data-tiktok-fullscreen-root]:fullscreen {
      position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;
      min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;
      display:block!important;margin:0!important;padding:0!important;border:0!important;
      background:#050607!important;overflow:hidden!important;transform:none!important;
      opacity:1!important;visibility:visible!important;
    }
    [data-tiktok-fullscreen-root]:fullscreen > [data-tiktok-fullscreen-video] {
      position:absolute!important;inset:0!important;width:100%!important;height:100%!important;
      min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;
      margin:0!important;padding:0!important;border:0!important;transform:none!important;
      opacity:1!important;visibility:visible!important;display:block!important;
      object-fit:contain!important;background:#050607!important;z-index:0!important;
      pointer-events:none!important;
    }
    [data-tiktok-fullscreen-root]:fullscreen > :not([data-tiktok-fullscreen-video]):not([data-tiktok-fullscreen-overlay]) {
      display:none!important;
    }
  `;
  const player = createFullscreenPlayer(
    video,
    {
      title: active.identity?.creator ? `@${active.identity.creator}` : 'TikTok video',
      onExit: () => {
        if (doc.fullscreenElement === root) {
          void doc
            .exitFullscreen()
            .catch(() => callbacks.onError('Could not exit fullscreen. Press Esc to exit.'));
        }
      },
    },
    doc,
  );
  player.element.dataset.tiktokFocusOwned = '';
  player.element.setAttribute('data-tiktok-fullscreen-overlay', '');
  player.element.hidden = true;
  root.setAttribute('data-tiktok-fullscreen-root', '');
  video.setAttribute('data-tiktok-fullscreen-video', '');
  video.controls = false;
  root.append(player.element);
  doc.documentElement.append(style);

  function restoreMarker(element: Element, name: string, value: string | null): void {
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  }
  function cleanup(): void {
    if (lifetime.signal.aborted) return;
    lifetime.abort();
    player.dispose();
    video.controls = previousControls;
    restoreMarker(root!, 'data-tiktok-fullscreen-root', previousRootMarker);
    restoreMarker(video, 'data-tiktok-fullscreen-video', previousVideoMarker);
    style.remove();
    if (
      entered &&
      previousFocus?.isConnected &&
      'focus' in previousFocus &&
      typeof previousFocus.focus === 'function'
    )
      (previousFocus as HTMLElement).focus({ preventScroll: true });
    callbacks.onClose();
  }
  doc.addEventListener(
    'fullscreenchange',
    () => {
      if (doc.fullscreenElement === root) {
        entered = true;
        player.element.hidden = false;
        player.focus();
      } else if (entered) cleanup();
    },
    { signal: lifetime.signal },
  );
  try {
    // Must run synchronously inside the toolbar's click, before any await.
    void root
      .requestFullscreen()
      .then(() => {
        if (lifetime.signal.aborted) {
          if (doc.fullscreenElement === root) void doc.exitFullscreen().catch(() => undefined);
          return;
        }
        if (doc.fullscreenElement !== root) {
          cleanup();
          return;
        }
        entered = true;
        player.element.hidden = false;
        player.focus();
      })
      .catch(() => {
        if (lifetime.signal.aborted) return;
        cleanup();
        callbacks.onError('Fullscreen was blocked. Click the video and try again.');
      });
  } catch (error) {
    cleanup();
    throw error;
  }
  return {
    video,
    videoId: active.identity?.videoId ?? null,
    showStatus: (message, error) => player.showStatus(message, error),
    dispose() {
      if (doc.fullscreenElement === root) void doc.exitFullscreen().catch(() => undefined);
      cleanup();
    },
  };
}
