import type { ActiveTikTokVideo } from './active-video';
import { startFullscreenSession, type FullscreenSession } from './fullscreen-session';
import { createVideoControlsAnchor } from './video-controls-anchor';
import styles from '../ui/styles/playback-controls.css?inline';

export interface PlaybackControls {
  update(video: ActiveTikTokVideo | null): void;
  showError(message: string): void;
  showStatus(message: string): void;
  dispose(): void;
}

/** Entry button and persistence status. Fullscreen lifecycle is owned by its session. */
export function createPlaybackControls(doc: Document = document): PlaybackControls {
  const lifetime = new AbortController();
  const host = doc.createElement('div');
  host.dataset.tiktokFocusOwned = '';
  host.setAttribute('data-tiktok-playback-controls', '');
  host.style.cssText = 'position:fixed;width:40px;height:40px;z-index:2147483647;';
  host.hidden = true;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = styles;
  const fullscreenButton = doc.createElement('button');
  fullscreenButton.type = 'button';
  fullscreenButton.setAttribute('aria-label', 'Fullscreen');
  fullscreenButton.title = 'Fullscreen';
  const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  icon.append(path);
  fullscreenButton.append(icon);
  const status = doc.createElement('p');
  status.className = 'status';
  status.setAttribute('role', 'status');
  shadow.append(style, fullscreenButton, status);
  const anchor = createVideoControlsAnchor(host, doc);
  // Preserve native hover propagation, but do not toggle the underlying player on click.
  for (const type of ['click', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup'])
    host.addEventListener(type, (event) => event.stopPropagation(), { signal: lifetime.signal });

  let active: ActiveTikTokVideo | null = null;
  let session: FullscreenSession | null = null;

  fullscreenButton.addEventListener(
    'click',
    () => {
      if (!active || session || lifetime.signal.aborted) return;
      const showFailure = (message: string): void => {
        status.setAttribute('data-error', '');
        status.textContent = message;
        session?.showStatus(message, true);
      };
      try {
        session = startFullscreenSession(active, {
          onClose: () => {
            session = null;
            fullscreenButton.disabled = false;
          },
          onError: showFailure,
        });
        session.showStatus(status.textContent ?? '', status.hasAttribute('data-error'));
        fullscreenButton.disabled = true;
      } catch {
        showFailure('This player could not open fullscreen. Try again after the video loads.');
      }
    },
    { signal: lifetime.signal },
  );

  return {
    update(video) {
      if (lifetime.signal.aborted) return;
      if (
        session &&
        (!session.video.isConnected ||
          (video &&
            (video.element !== session.video ||
              (video.identity?.videoId ?? null) !== session.videoId)))
      )
        session.dispose();
      active = video;
      anchor.update(active?.element ?? null);
      if (active) {
        if (!host.isConnected) doc.documentElement.append(host);
      } else host.remove();
    },
    showError(message) {
      status.setAttribute('data-error', '');
      status.textContent = message;
      session?.showStatus(message, true);
    },
    showStatus(message) {
      status.removeAttribute('data-error');
      status.textContent = message;
      session?.showStatus(message);
    },
    dispose() {
      if (lifetime.signal.aborted) return;
      lifetime.abort();
      anchor.dispose();
      session?.dispose();
      host.remove();
      active = null;
    },
  };
}
