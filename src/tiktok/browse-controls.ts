import { isOwnedElement } from './active-video';
import {
  BROWSE_CLOSE_SELECTOR,
  BROWSE_MENU_SELECTOR,
  BROWSE_VIDEO_SELECTOR,
  VIDEO_SELECTOR,
} from './selectors';

/** Browser Mode has an absolute toolbar outside the letterboxed media surface. */
export function findBrowseControls(video: HTMLVideoElement, view: Window) {
  let container = video.closest<HTMLElement>(BROWSE_VIDEO_SELECTOR);
  for (let depth = 0; container && depth < 8; depth++, container = container.parentElement) {
    if (
      ['BODY', 'HTML'].includes(container.tagName) ||
      container.querySelectorAll(VIDEO_SELECTOR).length !== 1
    )
      break;
    const menus = Array.from(container.querySelectorAll<HTMLElement>(BROWSE_MENU_SELECTOR)).filter(
      (element) => !isOwnedElement(element),
    );
    if (menus.length !== 1 || !container.querySelector(BROWSE_CLOSE_SELECTOR)) continue;
    const menu = menus[0];
    if (!menu || view.getComputedStyle(container).position === 'static') continue;
    const bounds = container.getBoundingClientRect();
    const menuBounds = menu.getBoundingClientRect();
    if (
      bounds.width < 120 ||
      bounds.height < 100 ||
      menuBounds.width < 24 ||
      menuBounds.width > 80 ||
      menuBounds.height < 24 ||
      menuBounds.height > 80 ||
      menuBounds.left < bounds.left ||
      menuBounds.right > bounds.right + 1 ||
      menuBounds.top < bounds.top ||
      menuBounds.bottom > bounds.top + 120
    )
      continue;
    return { container, menu, bounds, menuBounds };
  }
  return null;
}

/** Position only our host; keep native toolbar nodes and styles unchanged. */
export function positionBrowseControls(
  host: HTMLElement,
  layout: NonNullable<ReturnType<typeof findBrowseControls>>,
  view: Window,
): void {
  const { container, menu, bounds, menuBounds } = layout;
  const scaleX = container.offsetWidth > 0 ? bounds.width / container.offsetWidth : 1;
  const scaleY = container.offsetHeight > 0 ? bounds.height / container.offsetHeight : 1;
  const size = Math.max(40, menuBounds.height / scaleY);
  const menuOnRight = menuBounds.left + menuBounds.width / 2 >= bounds.left + bounds.width / 2;
  const x = menuOnRight ? menuBounds.left - (size + 8) * scaleX : menuBounds.right + 8 * scaleX;
  const y = menuBounds.top + (menuBounds.height - size * scaleY) / 2;
  const style = view.getComputedStyle(menu);
  host.setAttribute('data-detail-controls', '');
  host.style.position = 'absolute';
  host.style.width = host.style.height = `${size}px`;
  host.style.left = `${(x - bounds.left) / scaleX - container.clientLeft + container.scrollLeft}px`;
  host.style.top = `${(y - bounds.top) / scaleY - container.clientTop + container.scrollTop}px`;
  host.style.zIndex = style.zIndex === 'auto' ? '100' : style.zIndex;
  host.style.removeProperty('flex');
  host.style.removeProperty('align-self');
  host.style.removeProperty('margin-inline-end');
  host.style.setProperty('--control-size', `${size}px`);
  host.style.setProperty('--control-color', style.color);
  host.style.setProperty('--control-background', style.backgroundColor);
  host.style.setProperty('--status-width', '240px');
  if (host.parentElement !== container) container.append(host);
  host.hidden =
    menuBounds.top < 0 ||
    menuBounds.bottom > view.innerHeight ||
    x < Math.max(0, bounds.left) ||
    x + size * scaleX > Math.min(view.innerWidth, bounds.right);
}
