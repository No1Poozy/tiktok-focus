import {
  extractVideoMetadata,
  isOwnedElement,
  selectActiveVideo,
  type ActiveTikTokVideo,
  type TikTokActiveVideoCapability,
  type TikTokDomEnvironment,
} from './active-video';
import type { TikTokNavigation, TikTokNavigationCapability } from './navigation';
import { VIDEO_SELECTOR } from './selectors';
import type { TikTokVideoIdentity } from './types';
import { parseTikTokVideoUrl } from './video-identity';

export interface TikTokAdapter extends TikTokActiveVideoCapability, TikTokNavigationCapability {
  /** Aborted when the owning content-script context is invalidated. */
  readonly signal: AbortSignal;
  getVideoIdentity(url: string): TikTokVideoIdentity | null;
  /** Idempotent; ends this adapter's lifetime and rejects subsequent operations. */
  dispose(): void;
}

/** No DOM access, listeners, observers, or timers are installed at construction. */
export function createTikTokAdapter(suppliedEnvironment?: TikTokDomEnvironment): TikTokAdapter {
  const lifetime = new AbortController();
  const activeListeners = new Set<(video: ActiveTikTokVideo | null) => void>();
  const navigationListeners = new Set<(navigation: TikTokNavigation) => void>();
  let observerState: ReturnType<typeof startObservation> | undefined;

  function assertAlive(): void {
    if (lifetime.signal.aborted) throw new Error('TikTok adapter has been disposed.');
  }

  function getEnvironment(): TikTokDomEnvironment {
    if (suppliedEnvironment) return suppliedEnvironment;
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      throw new Error('TikTok DOM capabilities require a browser document.');
    }
    return { document, window };
  }

  function startObservation() {
    const environment = getEnvironment();
    const { document, window } = environment;
    const constructors = document.defaultView;
    if (!constructors) throw new Error('TikTok observation requires a document window.');
    const videos = new Set(document.querySelectorAll<HTMLVideoElement>(VIDEO_SELECTOR));
    let active: ActiveTikTokVideo | null = selectActiveVideo(videos, environment);
    let currentUrl = window.location.href;
    let frame: number | undefined;
    let stopped = false;
    const removals: (() => void)[] = [];

    function update(): void {
      frame = undefined;
      if (stopped || lifetime.signal.aborted) return;
      const nextUrl = window.location.href;
      if (currentUrl !== nextUrl) {
        currentUrl = nextUrl;
        const navigation = { url: nextUrl, videoIdentity: parseTikTokVideoUrl(nextUrl) };
        for (const listener of navigationListeners) listener(navigation);
      }
      const next = selectActiveVideo(videos, environment);
      if (
        active?.element === next?.element &&
        active?.identity?.canonicalUrl === next?.identity?.canonicalUrl
      ) {
        return;
      }
      active = next;
      for (const listener of activeListeners) listener(active);
    }

    function schedule(): void {
      if (!stopped && frame === undefined) frame = window.requestAnimationFrame(update);
    }

    const intersections =
      typeof constructors.IntersectionObserver === 'function'
        ? new constructors.IntersectionObserver(schedule, { threshold: [0, 0.2, 0.5, 0.8, 1] })
        : undefined;
    for (const video of videos) intersections?.observe(video);

    function addVideos(node: Node): void {
      if (node.nodeType !== 1) return;
      const element = node as Element;
      if (isOwnedElement(element)) return;
      const added = element.matches(VIDEO_SELECTOR)
        ? [element]
        : element.querySelectorAll<HTMLVideoElement>(VIDEO_SELECTOR);
      for (const video of added) {
        if (videos.has(video) || isOwnedElement(video)) continue;
        videos.add(video);
        intersections?.observe(video);
      }
    }

    const mutations = new constructors.MutationObserver((records) => {
      let relevant = false;
      for (const record of records) {
        const target =
          record.target.nodeType === 1 ? (record.target as Element) : record.target.parentElement;
        if (target && isOwnedElement(target)) continue;
        if (record.type === 'childList') {
          const changed = [...record.addedNodes, ...record.removedNodes];
          if (
            changed.length &&
            changed.every((node) => {
              const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
              return element !== null && isOwnedElement(element);
            })
          )
            continue;
        }
        relevant = true;
        for (const node of record.addedNodes) addVideos(node);
      }
      if (!relevant) return;
      for (const video of videos) {
        if (!video.isConnected) {
          intersections?.unobserve(video);
          videos.delete(video);
        }
      }
      schedule();
    });
    mutations.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'src', 'class', 'style', 'hidden', 'id', 'data-e2e'],
    });

    function listen(target: EventTarget, type: string, capture = false): void {
      target.addEventListener(type, schedule, { capture, passive: true });
      removals.push(() => target.removeEventListener(type, schedule, capture));
    }

    listen(document, 'scroll', true);
    listen(window, 'resize');
    const visibilityChanged = () => {
      // Animation frames stop in background tabs; consumers still need to flush.
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      update();
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    removals.push(() => document.removeEventListener('visibilitychange', visibilityChanged));
    for (const type of ['play', 'pause', 'ended', 'loadedmetadata', 'emptied']) {
      listen(document, type, true);
    }
    for (const type of ['popstate', 'hashchange', 'pageshow']) listen(window, type);
    const navigation: unknown = 'navigation' in window ? window.navigation : undefined;
    if (
      navigation &&
      typeof navigation === 'object' &&
      'addEventListener' in navigation &&
      typeof navigation.addEventListener === 'function' &&
      'removeEventListener' in navigation &&
      typeof navigation.removeEventListener === 'function'
    ) {
      // Only EventTarget's two validated methods are used; no page history patch.
      const source = navigation as EventTarget;
      listen(source, 'navigatesuccess');
      listen(source, 'currententrychange');
    }

    return {
      getActive: () => selectActiveVideo(videos, environment),
      stop() {
        stopped = true;
        if (frame !== undefined) window.cancelAnimationFrame(frame);
        mutations.disconnect();
        intersections?.disconnect();
        for (const remove of removals) remove();
        videos.clear();
      },
    };
  }

  function ensureObservation(): void {
    observerState ??= startObservation();
  }

  function stopWhenUnused(): void {
    if (activeListeners.size || navigationListeners.size) return;
    observerState?.stop();
    observerState = undefined;
  }

  function getActiveVideo(): ActiveTikTokVideo | null {
    assertAlive();
    if (observerState) return observerState.getActive();
    const environment = getEnvironment();
    return selectActiveVideo(
      environment.document.querySelectorAll<HTMLVideoElement>(VIDEO_SELECTOR),
      environment,
    );
  }

  return {
    signal: lifetime.signal,
    getVideoIdentity(url) {
      assertAlive();
      return parseTikTokVideoUrl(url);
    },
    getActiveVideo,
    getVideoElement: () => getActiveVideo()?.element ?? null,
    extractMetadata(video) {
      assertAlive();
      return extractVideoMetadata(video);
    },
    observeActiveVideo(listener) {
      assertAlive();
      ensureObservation();
      activeListeners.add(listener);
      listener(getActiveVideo());
      return () => {
        activeListeners.delete(listener);
        stopWhenUnused();
      };
    },
    observeNavigation(listener) {
      assertAlive();
      ensureObservation();
      navigationListeners.add(listener);
      const url = getEnvironment().window.location.href;
      listener({ url, videoIdentity: parseTikTokVideoUrl(url) });
      return () => {
        navigationListeners.delete(listener);
        stopWhenUnused();
      };
    },
    dispose() {
      if (lifetime.signal.aborted) return;
      lifetime.abort();
      observerState?.stop();
      observerState = undefined;
      activeListeners.clear();
      navigationListeners.clear();
    },
  };
}
