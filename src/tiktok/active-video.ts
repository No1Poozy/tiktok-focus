import type { StopTikTokObservation, TikTokVideoIdentity, TikTokVideoMetadata } from './types';
import {
  CAPTION_SELECTOR,
  CANVAS_PLAYER_SELECTOR,
  DETAIL_VIDEO_SELECTOR,
  FEED_CARD_SELECTOR,
  FEED_AUTHOR_SELECTOR,
  OWNED_SELECTOR,
  VIDEO_LINK_SELECTOR,
  VIDEO_SELECTOR,
} from './selectors';
import { parseTikTokVideoUrl } from './video-identity';

/** The selected visible video; missing identity must never become a history row. */
export interface ActiveTikTokVideo {
  readonly element: HTMLVideoElement;
  /** A playing element can exist before its identity is known. */
  readonly identity: TikTokVideoIdentity | null;
}

export interface TikTokActiveVideoCapability {
  getActiveVideo(): ActiveTikTokVideo | null;
  getVideoElement(): HTMLVideoElement | null;
  extractMetadata(video: ActiveTikTokVideo): TikTokVideoMetadata;
  /** Implementation must stop observation when its owning adapter is disposed. */
  observeActiveVideo(listener: (video: ActiveTikTokVideo | null) => void): StopTikTokObservation;
}

export interface TikTokDomEnvironment {
  readonly document: Document;
  readonly window: Window;
}

export function isOwnedElement(element: Element): boolean {
  return element.closest(OWNED_SELECTOR) !== null;
}

function isVisible(element: Element, window: Window): boolean {
  if (
    typeof element.checkVisibility === 'function' &&
    !element.checkVisibility({ opacityProperty: true, visibilityProperty: true })
  )
    return false;
  const style = window.getComputedStyle(element);
  return (
    style.visibility !== 'hidden' &&
    style.visibility !== 'collapse' &&
    style.display !== 'none' &&
    style.opacity !== '0'
  );
}

/** Some TikTok players render frames on a canvas while their media element is transparent. */
export function presentationSurface(video: HTMLVideoElement, window: Window): Element | null {
  if (isVisible(video, window)) return video;
  const style = window.getComputedStyle(video);
  if (style.opacity !== '0' || style.display === 'none' || style.visibility !== 'visible')
    return null;
  const player = video.closest(CANVAS_PLAYER_SELECTOR);
  if (!player || player.querySelectorAll(VIDEO_SELECTOR).length !== 1) return null;
  const surfaces = Array.from(player.querySelectorAll('canvas')).filter(
    (canvas) => !isOwnedElement(canvas) && isVisible(canvas, window),
  );
  return surfaces.length === 1 ? (surfaces[0] ?? null) : null;
}

function getPlayerVideoId(video: HTMLVideoElement): string | undefined {
  const player = video.closest(CANVAS_PLAYER_SELECTOR);
  if (!player || player.querySelectorAll(VIDEO_SELECTOR).length !== 1) return undefined;
  return /^xgwrapper-\d+-(\d+)$/.exec(player.id)?.[1];
}

/** Current feed cards expose the ID on the player and the creator on its avatar link. */
function findFeedContext(video: HTMLVideoElement): {
  identity: TikTokVideoIdentity | null;
  scope: Element | null;
} {
  const card = video.closest(FEED_CARD_SELECTOR);
  const videoId = getPlayerVideoId(video);
  if (!card || !videoId || card.querySelectorAll(VIDEO_SELECTOR).length !== 1)
    return { identity: null, scope: null };
  const identities = new Map<string, TikTokVideoIdentity>();
  for (const author of card.querySelectorAll(FEED_AUTHOR_SELECTOR)) {
    const href = author.getAttribute('href');
    if (!href) return { identity: null, scope: null };
    const profile = href.startsWith('/') ? `https://www.tiktok.com${href}` : href;
    const identity = parseTikTokVideoUrl(`${profile.replace(/\/$/, '')}/video/${videoId}`);
    if (!identity) return { identity: null, scope: null };
    identities.set(identity.canonicalUrl, identity);
  }
  if (identities.size !== 1) return { identity: null, scope: null };
  const identity = identities.values().next().value;
  if (!identity) return { identity: null, scope: null };
  // A contradictory permalink can indicate a card midway through recycling.
  for (const link of card.querySelectorAll(VIDEO_LINK_SELECTOR)) {
    const href = link.getAttribute('href');
    const linked =
      href && parseTikTokVideoUrl(href.startsWith('/') ? `https://www.tiktok.com${href}` : href);
    if (linked && linked.canonicalUrl !== identity.canonicalUrl)
      return { identity: null, scope: null };
  }
  return { identity, scope: card };
}

/** Never borrow a permalink from a neighbouring feed item. */
function findVideoContext(video: HTMLVideoElement): {
  identity: TikTokVideoIdentity | null;
  scope: Element | null;
} {
  const card = video.closest(FEED_CARD_SELECTOR);
  let scope: Element | null = video;
  for (let depth = 0; scope && depth < 8; depth += 1, scope = scope.parentElement) {
    if (scope.tagName === 'BODY' || scope.tagName === 'HTML' || scope.tagName === 'MAIN') break;
    if (scope.querySelectorAll(VIDEO_SELECTOR).length > 1) break;
    const links = scope.matches(VIDEO_LINK_SELECTOR)
      ? [scope]
      : Array.from(scope.querySelectorAll(VIDEO_LINK_SELECTOR));
    const identities = new Map<string, TikTokVideoIdentity>();
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;
      const identity = parseTikTokVideoUrl(
        href.startsWith('/') ? `https://www.tiktok.com${href}` : href,
      );
      if (identity) identities.set(identity.videoId, identity);
    }
    if (identities.size === 1) {
      return { identity: identities.values().next().value ?? null, scope };
    }
    if (identities.size > 1) return { identity: null, scope: null };
    if (scope === card) break;
  }
  return findFeedContext(video);
}

/** Geometry dominates playback: a hidden autoplay/preload must not win. */
export function selectActiveVideo(
  videos: Iterable<HTMLVideoElement>,
  environment: TikTokDomEnvironment,
): ActiveTikTokVideo | null {
  const { document, window } = environment;
  if (document.visibilityState === 'hidden') return null;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let bestVideo: HTMLVideoElement | null = null;
  let bestScore = 0;
  const candidates = Array.from(videos).filter(
    (video) => video.isConnected && !isOwnedElement(video),
  );
  for (const video of candidates) {
    const surface = presentationSurface(video, window);
    if (!surface) continue;
    const rect = surface.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) continue;
    const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(
      0,
      Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0),
    );
    const visibleArea = visibleWidth * visibleHeight;
    const visibleRatio = visibleArea / (rect.width * rect.height);
    if (visibleRatio < 0.2 || visibleArea < 1_600) continue;
    const distance = Math.abs((rect.top + rect.bottom) / 2 - viewportHeight / 2);
    const centerScore = Math.max(0, 1 - distance / viewportHeight);
    const areaScore = Math.min(1, visibleArea / (viewportWidth * viewportHeight));
    const playingScore = !video.paused && !video.ended ? 0.25 : 0;
    const score = visibleRatio + centerScore * 0.5 + areaScore * 0.5 + playingScore;
    if (score > bestScore) {
      bestVideo = video;
      bestScore = score;
    }
  }
  if (!bestVideo) return null;
  const context = findVideoContext(bestVideo);
  const routeIdentity = parseTikTokVideoUrl(window.location.href);
  const player = bestVideo.closest(CANVAS_PLAYER_SELECTOR);
  const playerVideoId = getPlayerVideoId(bestVideo);
  // A matching player ID is stronger evidence than the number of preloaded players.
  // A stale route must never be assigned to a wrapper for a different video.
  const matchesRoute =
    playerVideoId !== undefined
      ? playerVideoId === routeIdentity?.videoId &&
        player?.querySelectorAll(VIDEO_SELECTOR).length === 1
      : candidates.filter((video) => video.closest(DETAIL_VIDEO_SELECTOR)).length === 1;
  // URL fallback is limited to a verified detail player. Recommendations and
  // ambiguous layouts must supply their own local permalink.
  const identity =
    context.identity ??
    (bestVideo.closest(DETAIL_VIDEO_SELECTOR) && matchesRoute ? routeIdentity : null);
  return { element: bestVideo, identity };
}

export function extractVideoMetadata(video: ActiveTikTokVideo): TikTokVideoMetadata {
  const context = findVideoContext(video.element);
  const caption = context.scope
    ?.querySelector(CAPTION_SELECTOR)
    ?.textContent?.replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2_000);
  const duration = video.element.duration;
  const poster = video.element.poster;
  let thumbnailUrl: string | undefined;
  if (poster) {
    try {
      const url = new URL(poster, 'https://www.tiktok.com');
      if (url.protocol === 'https:' && !url.username && !url.password) thumbnailUrl = url.href;
    } catch {
      // A malformed optional poster never prevents progress tracking.
    }
  }
  return {
    ...(caption ? { caption } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(Number.isFinite(duration) && duration > 0 ? { durationSeconds: duration } : {}),
  };
}
