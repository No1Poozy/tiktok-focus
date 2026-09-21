import { isOwnedElement } from './active-video';
import { PLAYER_MORE_SELECTOR } from './selectors';

/** Find the native top actions row using its marked menu, never generated class names. */
export function findNativeControlsDock(scope: Element, bounds: DOMRect, view: Window) {
  for (const menu of scope.querySelectorAll(PLAYER_MORE_SELECTOR)) {
    if (isOwnedElement(menu)) continue;
    const rect = menu.getBoundingClientRect();
    if (
      rect.width < 24 ||
      rect.width > 64 ||
      rect.height < 24 ||
      rect.height > 64 ||
      rect.left < bounds.left + bounds.width / 2 ||
      rect.right > bounds.right + 2 ||
      rect.top < bounds.top ||
      rect.bottom > bounds.top + 96
    )
      continue;
    let branch = menu;
    for (let depth = 0; depth < 4; depth++) {
      // A flex ancestor does not make an absolutely positioned menu a flex item.
      // Inserting beside it would leave the menu sitting on top of our button.
      const position = view.getComputedStyle(branch).position;
      if (position === 'absolute' || position === 'fixed') break;
      const parent = branch.parentElement;
      if (
        !parent ||
        parent === scope ||
        ['BUTTON', 'A'].includes(parent.tagName) ||
        parent.getAttribute('role') === 'button'
      )
        break;
      const style = view.getComputedStyle(parent);
      if (
        (style.display === 'flex' || style.display === 'inline-flex') &&
        style.flexDirection === 'row'
      ) {
        return { container: parent, before: branch, menu, size: Math.max(40, rect.height) };
      }
      branch = parent;
    }
  }
  return null;
}
