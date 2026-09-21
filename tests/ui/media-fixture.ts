import { parseHTML } from 'linkedom';
import { vi } from 'vitest';

export function mediaFixture() {
  const { document, window } = parseHTML(
    '<html><body><article id="player"><video style="opacity:0"></video><canvas></canvas></article></body></html>',
  );
  const video = document.querySelector<HTMLVideoElement>('video');
  const root = document.getElementById('player');
  if (!video || !root) throw new Error('Invalid media fixture');
  Object.assign(video, {
    currentTime: 12,
    duration: 120,
    paused: false,
    ended: false,
    readyState: 4,
    controls: true,
    volume: 0.8,
    muted: false,
    playbackRate: 1,
    error: null,
    buffered: { length: 1, start: () => 0, end: () => 60 },
  });
  const emit = (type: string) => video.dispatchEvent(new window.Event(type));
  const play = vi.fn(() => {
    Object.defineProperty(video, 'paused', { value: false, writable: true });
    emit('play');
    return Promise.resolve();
  });
  const pause = vi.fn(() => {
    Object.defineProperty(video, 'paused', { value: true, writable: true });
    emit('pause');
  });
  video.play = play;
  video.pause = pause;
  const setFullscreen = (element: Element | null) => {
    Object.defineProperty(document, 'fullscreenElement', { value: element, configurable: true });
    document.dispatchEvent(new window.Event('fullscreenchange'));
  };
  Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
  const exitFullscreen = vi.fn(() => {
    setFullscreen(null);
    return Promise.resolve();
  });
  document.exitFullscreen = exitFullscreen;
  function attachFocusStub(): void {
    const overlay = root!.querySelector('[data-tiktok-fullscreen-overlay]');
    const player = overlay?.shadowRoot?.querySelector<HTMLElement>('.player');
    if (player) player.focus = vi.fn();
  }
  const requestFullscreen = vi.fn(() => {
    attachFocusStub();
    setFullscreen(root);
    return Promise.resolve();
  });
  root.requestFullscreen = requestFullscreen;
  return {
    document,
    window,
    video,
    root,
    play,
    pause,
    emit,
    setFullscreen,
    requestFullscreen,
    exitFullscreen,
    attachFocusStub,
  };
}
