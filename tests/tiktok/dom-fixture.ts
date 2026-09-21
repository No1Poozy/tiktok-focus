import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { vi } from 'vitest';

export function loadFixture(
  name: 'feed' | 'detail' | 'modern-detail' | 'canvas-detail' | 'modern-feed',
) {
  const html = readFileSync(new URL(`../fixtures/tiktok/${name}.html`, import.meta.url), 'utf8');
  const { document, window } = parseHTML(html);
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const location = { href: 'https://www.tiktok.com/foryou' };
  const navigation = new window.EventTarget();
  Object.defineProperties(window, {
    location: { value: location, configurable: true },
    navigation: { value: navigation, configurable: true },
    innerWidth: { value: 1_200, configurable: true },
    innerHeight: { value: 800, configurable: true },
    getComputedStyle: {
      value: (element: Element) => ({
        visibility: element.getAttribute('data-test-visibility') ?? 'visible',
        display: element.getAttribute('data-test-display') ?? 'block',
        opacity: element.getAttribute('data-test-opacity') ?? '1',
      }),
      configurable: true,
    },
    requestAnimationFrame: {
      value: (callback: FrameRequestCallback) => {
        frameId += 1;
        frames.set(frameId, callback);
        return frameId;
      },
      configurable: true,
    },
    cancelAnimationFrame: {
      value: vi.fn((id: number) => frames.delete(id)),
      configurable: true,
    },
  });
  Object.defineProperty(document, 'visibilityState', {
    value: 'visible',
    writable: true,
    configurable: true,
  });
  for (const video of document.querySelectorAll<HTMLVideoElement>('video')) {
    setVideoState(video, { top: 900, paused: true });
  }
  return {
    document,
    window,
    location,
    navigation,
    frames,
    video(id: string): HTMLVideoElement {
      const video = document.querySelector<HTMLVideoElement>(`#${id}`);
      if (!video) throw new Error(`Missing fixture video ${id}`);
      return video;
    },
    async flush() {
      await Promise.resolve();
      const callbacks = Array.from(frames.values());
      frames.clear();
      for (const callback of callbacks) callback(0);
      await Promise.resolve();
    },
  };
}

export function setVideoState(
  video: HTMLVideoElement,
  options: { top: number; paused?: boolean; duration?: number; width?: number; height?: number },
): void {
  const { top, paused = false, duration = 120, width = 320, height = 600 } = options;
  Object.defineProperties(video, {
    paused: { value: paused, writable: true, configurable: true },
    ended: { value: false, writable: true, configurable: true },
    duration: { value: duration, writable: true, configurable: true },
    poster: { value: video.getAttribute('poster') ?? '', writable: true, configurable: true },
    getBoundingClientRect: {
      value: () => ({ top, bottom: top + height, left: 400, right: 400 + width, width, height }),
      configurable: true,
    },
  });
}
