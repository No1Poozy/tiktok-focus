import { isOwnedElement, presentationSurface } from './active-video';
import {
  FEED_CARD_SELECTOR,
  PLAYER_CONTROL_SELECTOR,
  PLAYER_MORE_SELECTOR,
  VIDEO_SELECTOR,
} from './selectors';
import { findNativeControlsDock } from './native-controls-dock';
import { findBrowseControls, positionBrowseControls } from './browse-controls';

const INSET = 12;
const BUTTON_SIZE = 40;
const GAP = 8;

/** Joins native top actions when available; otherwise positions a standalone entry. */
export function createVideoControlsAnchor(host: HTMLElement, doc: Document) {
  const ownerWindow = doc.defaultView;
  if (!ownerWindow) throw new Error('Video controls require a document window.');
  const view = ownerWindow;
  const lifetime = new AbortController();
  const events = { signal: lifetime.signal, passive: true };
  let media: HTMLVideoElement | null = null;
  let scope: Element | null = null;
  let surface: Element | null = null;
  let detailContainer: Element | null = null;
  let bounds: DOMRect | null = null;
  let pointer: { x: number; y: number } | null = null;
  let frame: number | undefined;
  let hovered = false;

  const resize = new view.ResizeObserver(schedule);
  const mutations = new view.MutationObserver((records) => {
    if (
      records.some((record) => {
        if (isOwnedElement(record.target as Element)) return false;
        const changed = [...record.addedNodes, ...record.removedNodes];
        return changed.some((node) => node.nodeType !== 1 || !isOwnedElement(node as Element));
      })
    )
      schedule();
  });

  function updateHover(): void {
    const next = !!(
      bounds &&
      pointer &&
      pointer.x >= bounds.left &&
      pointer.x <= bounds.right &&
      pointer.y >= bounds.top &&
      pointer.y <= bounds.bottom
    );
    if (next !== hovered) {
      hovered = next;
      host.toggleAttribute('data-video-hover', hovered);
      // Hover can reveal native controls that were display:none.
      if (hovered) schedule();
    }
  }

  function position(): void {
    frame = undefined;
    if (lifetime.signal.aborted) return;
    const nextSurface =
      media?.isConnected && !doc.fullscreenElement ? presentationSurface(media, view) : null;
    if (surface !== nextSurface) {
      if (surface) resize.unobserve(surface);
      surface = nextSurface;
      if (surface) resize.observe(surface);
    }
    bounds = surface?.getBoundingClientRect() ?? null;
    const browse = media && !doc.fullscreenElement ? findBrowseControls(media, view) : null;
    if (detailContainer !== (browse?.container ?? null)) {
      if (detailContainer && detailContainer !== scope) resize.unobserve(detailContainer);
      detailContainer = browse?.container ?? null;
      if (detailContainer) resize.observe(detailContainer);
    }
    if (browse) {
      bounds = browse.bounds;
      host.removeAttribute('data-docked');
      host.removeAttribute('data-paused');
      positionBrowseControls(host, browse, view);
      updateHover();
      return;
    }
    host.removeAttribute('data-detail-controls');
    host.style.removeProperty('--control-background');
    // Never pin a partly scrolled-away video's button to the viewport edge.
    if (
      !bounds ||
      bounds.top < 0 ||
      bounds.top + INSET + BUTTON_SIZE > view.innerHeight ||
      bounds.width < BUTTON_SIZE + 2 * INSET ||
      bounds.height < BUTTON_SIZE + 2 * INSET ||
      bounds.right > view.innerWidth ||
      bounds.left < 0
    ) {
      host.hidden = true;
      return;
    }
    const dock = scope && findNativeControlsDock(scope, bounds, view);
    if (dock) {
      host.setAttribute('data-docked', '');
      host.style.position = 'relative';
      host.style.left = host.style.top = 'auto';
      host.style.zIndex = 'auto';
      host.style.width = host.style.height = `${dock.size}px`;
      host.style.flex = `0 0 ${dock.size}px`;
      host.style.alignSelf = 'center';
      const gap = Number.parseFloat(view.getComputedStyle(dock.container).columnGap) || 0;
      host.style.marginInlineEnd = `${Math.max(0, GAP - gap)}px`;
      host.style.setProperty('--control-size', `${dock.size}px`);
      host.style.setProperty('--control-color', view.getComputedStyle(dock.menu).color || '#fff');
      host.style.setProperty('--status-width', `${Math.min(240, bounds.width - 2 * INSET)}px`);
      if (host.parentElement !== dock.container || host.nextElementSibling !== dock.before)
        dock.container.insertBefore(host, dock.before);
      host.hidden = false;
      const entryRect = host.getBoundingClientRect();
      const menuRect = dock.menu.getBoundingClientRect();
      const separated =
        entryRect.right + GAP <= menuRect.left + 0.5 ||
        menuRect.right + GAP <= entryRect.left + 0.5;
      if (
        entryRect.width >= BUTTON_SIZE &&
        entryRect.height >= BUTTON_SIZE &&
        Math.abs(entryRect.top + entryRect.height / 2 - menuRect.top - menuRect.height / 2) <= 2 &&
        separated
      ) {
        updateHover();
        return;
      }
      // A fixed-width or wrapped row may still overlap after insertion. Use the
      // existing collision-aware standalone placement instead of covering its menu.
      host.removeAttribute('data-docked');
    }
    // A native row can be replaced or temporarily hidden while TikTok updates a card.
    // Stay in a connected row during its own hide animation to preserve shared hover.
    if (
      host.hasAttribute('data-docked') &&
      scope?.contains(host) &&
      host.parentElement?.isConnected &&
      host.parentElement.querySelector(PLAYER_MORE_SELECTOR)
    ) {
      host.hidden = false;
      return;
    }
    host.removeAttribute('data-docked');
    host.style.position = 'fixed';
    host.style.zIndex = '2147483647';
    host.style.width = host.style.height = `${BUTTON_SIZE}px`;
    host.style.removeProperty('flex');
    host.style.removeProperty('align-self');
    host.style.removeProperty('margin-inline-end');
    host.style.removeProperty('--control-size');
    host.style.removeProperty('--control-color');
    if (host.parentElement !== doc.documentElement) doc.documentElement.append(host);
    const top = bounds.top + INSET;
    let left = bounds.right - INSET - BUTTON_SIZE;
    const obstacles = Array.from(scope?.querySelectorAll(PLAYER_CONTROL_SELECTOR) ?? [])
      .filter((element) => !isOwnedElement(element))
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0 && rect.width <= 96 && rect.height <= 96)
      .sort((a, b) => b.right - a.right);
    for (const rect of obstacles) {
      if (
        rect.top < top + BUTTON_SIZE + GAP &&
        rect.bottom > top - GAP &&
        rect.left < left + BUTTON_SIZE + GAP &&
        rect.right > left - GAP
      )
        left = rect.left - GAP - BUTTON_SIZE;
    }
    host.hidden = left < bounds.left + INSET;
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
    host.style.setProperty(
      '--status-width',
      `${Math.min(240, left + BUTTON_SIZE - bounds.left - INSET)}px`,
    );
    host.toggleAttribute('data-paused', !!media?.paused || !!media?.ended);
    updateHover();
  }

  function schedule(): void {
    if (!lifetime.signal.aborted && frame === undefined)
      frame = view.requestAnimationFrame(position);
  }

  doc.addEventListener('scroll', schedule, { ...events, capture: true });
  view.addEventListener('resize', schedule, events);
  view.visualViewport?.addEventListener('resize', schedule, events);
  view.visualViewport?.addEventListener('scroll', schedule, events);
  doc.addEventListener('fullscreenchange', schedule, events);
  doc.addEventListener(
    'pointermove',
    (event) => {
      pointer = { x: event.clientX, y: event.clientY };
      updateHover();
    },
    events,
  );
  doc.addEventListener(
    'pointerleave',
    () => {
      pointer = null;
      updateHover();
    },
    events,
  );
  for (const type of ['play', 'pause', 'ended', 'loadedmetadata']) {
    doc.addEventListener(
      type,
      (event) => {
        if (event.target === media) schedule();
      },
      { ...events, capture: true },
    );
  }

  return {
    update(video: HTMLVideoElement | null): void {
      if (lifetime.signal.aborted) return;
      if (media !== video) {
        host.removeAttribute('data-docked');
        resize.disconnect();
        mutations.disconnect();
        surface = null;
        detailContainer = null;
        bounds = null;
        media = video;
        scope = video?.closest(FEED_CARD_SELECTOR) ?? video?.parentElement ?? null;
        // Older detail players put the menu outside the immediate media wrapper.
        if (video && !video.closest(FEED_CARD_SELECTOR)) {
          for (let depth = 0; depth < 8; depth++) {
            const parent = scope?.parentElement;
            if (
              !parent ||
              ['BODY', 'HTML', 'MAIN'].includes(parent.tagName) ||
              parent.querySelectorAll(VIDEO_SELECTOR).length !== 1
            )
              break;
            scope = parent;
          }
        }
        if (scope) {
          resize.observe(scope);
          mutations.observe(scope, { childList: true, subtree: true });
        }
        host.hidden = true;
        host.toggleAttribute('data-video-hover', false);
        hovered = false;
      }
      schedule();
    },
    dispose(): void {
      lifetime.abort();
      if (frame !== undefined) view.cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      host.remove();
      media = scope = surface = detailContainer = bounds = null;
    },
  };
}
