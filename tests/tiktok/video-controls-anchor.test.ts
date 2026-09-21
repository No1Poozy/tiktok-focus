import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVideoControlsAnchor } from '../../src/tiktok/video-controls-anchor';
import { mediaFixture } from '../ui/media-fixture';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanups.splice(0)) dispose();
  vi.unstubAllGlobals();
});

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

function setup() {
  const fixture = mediaFixture();
  const { document, window, video, root } = fixture;
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const disconnect = vi.fn();
  const observe = vi.fn();
  let resizeCallback: () => void = () => {};
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resizeCallback = callback;
      }
      observe = observe;
      unobserve = vi.fn();
      disconnect = disconnect;
    },
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  vi.stubGlobal('innerWidth', 1200);
  vi.stubGlobal('innerHeight', 900);
  vi.stubGlobal('getComputedStyle', (element: Element) => ({
    visibility: 'visible',
    display: (element as HTMLElement).style.display || 'block',
    position: (element as HTMLElement).style.position || 'static',
    flexDirection: (element as HTMLElement).style.flexDirection || 'row',
    color: (element as HTMLElement).style.color || 'rgb(255, 255, 255)',
    opacity: (element as HTMLElement).style.opacity || '1',
  }));
  video.style.opacity = '1';
  let bounds = rect(200, 100, 600, 500);
  video.getBoundingClientRect = () => bounds;
  const host = document.createElement('div');
  host.dataset.tiktokFocusOwned = '';
  document.documentElement.append(host);
  const anchor = createVideoControlsAnchor(host, document);
  cleanups.push(() => anchor.dispose());
  function flush() {
    const batch = [...callbacks.values()];
    callbacks.clear();
    for (const callback of batch) callback(0);
  }
  anchor.update(video);
  flush();
  return {
    ...fixture,
    host,
    anchor,
    callbacks,
    disconnect,
    observe,
    flush,
    resize: () => resizeCallback(),
    move: (next: DOMRect) => {
      bounds = next;
    },
    pointer(x: number, y: number) {
      const event = Object.assign(new window.Event('pointermove'), { clientX: x, clientY: y });
      document.dispatchEvent(event);
    },
    menu(left: number, top: number) {
      const button = document.createElement('button');
      button.getBoundingClientRect = () => rect(left, top, 40, 40);
      root.append(button);
      return button;
    },
  };
}

describe('video control anchor', () => {
  it('anchors Browser Mode to browse-ellipsis outside the video and includes the toolbar in hover', () => {
    const f = setup();
    f.move(rect(200, 180, 600, 500));
    f.root.setAttribute('data-e2e', 'browse-video');
    const panel = f.document.createElement('div');
    panel.style.position = 'relative';
    panel.getBoundingClientRect = () => rect(20, 40, 1100, 800);
    Object.assign(panel, {
      offsetWidth: 1100,
      offsetHeight: 800,
      clientLeft: 0,
      clientTop: 0,
      scrollLeft: 0,
      scrollTop: 0,
    });
    f.document.body.append(panel);
    panel.append(f.root);
    const close = f.document.createElement('button');
    close.setAttribute('data-e2e', 'browse-close');
    const menu = f.document.createElement('div');
    menu.setAttribute('data-e2e', 'browse-ellipsis');
    menu.getBoundingClientRect = () => rect(1060, 60, 40, 40);
    panel.append(close, menu);
    f.anchor.update(null);
    f.anchor.update(f.video);
    f.flush();
    expect(f.host.parentElement).toBe(panel);
    expect(f.host.hasAttribute('data-detail-controls')).toBe(true);
    expect(f.host.hasAttribute('data-docked')).toBe(false);
    expect(f.host.style.position).toBe('absolute');
    expect(f.host.style.left).toBe('992px');
    expect(f.host.style.top).toBe('20px');
    expect(f.host.hidden).toBe(false);
    f.pointer(1030, 80);
    expect(f.host.hasAttribute('data-video-hover')).toBe(true);
    f.pointer(1150, 80);
    expect(f.host.hasAttribute('data-video-hover')).toBe(false);
    expect(f.video.parentElement).toBe(f.root);
    close.remove();
    f.resize();
    f.flush();
    expect(f.host.hasAttribute('data-detail-controls')).toBe(false);
  });

  it('does not treat a feed video with a browse menu elsewhere as Browser Mode', () => {
    const f = setup();
    const menu = f.menu(744, 108);
    menu.setAttribute('data-e2e', 'browse-ellipsis');
    const close = f.document.createElement('button');
    close.setAttribute('data-e2e', 'browse-close');
    f.root.append(close);
    f.resize();
    f.flush();
    expect(f.host.hasAttribute('data-detail-controls')).toBe(false);
  });

  it('joins the marked native menu row and recovers when that row is replaced', () => {
    const f = setup();
    const row = f.document.createElement('div');
    row.style.display = 'flex';
    const wrapper = f.document.createElement('div');
    const menu = f.menu(744, 108);
    f.host.getBoundingClientRect = () => rect(688, 108, 48, 48);
    menu.style.color = 'rgba(255, 255, 255, 0.9)';
    menu.setAttribute('data-e2e', 'more-menu-icon');
    menu.getBoundingClientRect = () => rect(744, 108, 48, 48);
    wrapper.append(menu);
    row.append(wrapper);
    f.root.append(row);
    f.resize();
    f.flush();
    expect(f.host.parentElement).toBe(row);
    expect(f.host.nextElementSibling).toBe(wrapper);
    expect(f.host.style.position).toBe('relative');
    expect(f.host.style.width).toBe('48px');
    expect(f.host.hasAttribute('data-docked')).toBe(true);
    expect(f.video.parentElement).toBe(f.root);
    expect(f.host.style.getPropertyValue('--control-color')).toBe('rgba(255, 255, 255, 0.9)');

    row.remove();
    f.resize();
    f.flush();
    expect(f.host.parentElement).toBe(f.document.documentElement);
    expect(f.host.hasAttribute('data-docked')).toBe(false);
    expect(f.host.style.position).toBe('fixed');
    expect(f.host.style.getPropertyValue('--control-color') ?? '').toBe('');

    f.root.append(row);
    f.resize();
    f.flush();
    expect(f.host.parentElement).toBe(row);
    f.anchor.dispose();
    expect(row.contains(f.host)).toBe(false);
    expect(wrapper.contains(menu)).toBe(true);
  });

  it('does not join a marked menu below the video control area', () => {
    const f = setup();
    const row = f.document.createElement('div');
    row.style.display = 'flex';
    const menu = f.menu(744, 550);
    menu.setAttribute('data-e2e', 'more-menu-icon');
    row.append(menu);
    f.root.append(row);
    f.resize();
    f.flush();
    expect(f.host.parentElement).toBe(f.document.documentElement);
    expect(f.host.hasAttribute('data-docked')).toBe(false);
  });

  it.each(['absolute', 'fixed'])('avoids a %s menu inside a flex detail player', (position) => {
    const f = setup();
    const panel = f.document.createElement('div');
    panel.style.display = 'flex';
    const menu = f.menu(744, 108);
    menu.style.position = position;
    menu.setAttribute('data-e2e', 'more-menu-icon');
    panel.append(menu);
    f.root.append(panel);
    f.resize();
    f.flush();
    expect(f.host.hasAttribute('data-docked')).toBe(false);
    expect(f.host.parentElement).toBe(f.document.documentElement);
    expect(Number.parseFloat(f.host.style.left) + 40 + 8).toBeLessThanOrEqual(744);
    expect(menu.parentElement).toBe(panel);
    expect(menu.style.position).toBe(position);
  });

  it('rejects a native row that still overlaps after insertion', () => {
    const f = setup();
    const row = f.document.createElement('div');
    row.style.display = 'flex';
    const menu = f.menu(744, 108);
    menu.setAttribute('data-e2e', 'more-menu-icon');
    f.host.getBoundingClientRect = () => rect(744, 108, 40, 40);
    row.append(menu);
    f.root.append(row);
    f.resize();
    f.flush();
    expect(f.host.hasAttribute('data-docked')).toBe(false);
    expect(f.host.parentElement).toBe(f.document.documentElement);
    expect(Number.parseFloat(f.host.style.left) + 40 + 8).toBeLessThanOrEqual(744);
  });

  it('follows the video during scrolling and resize, coalescing geometry work', () => {
    const f = setup();
    expect(f.host.style.left).toBe('748px');
    expect(f.host.style.top).toBe('112px');
    expect(f.host.hidden).toBe(false);
    f.move(rect(320, 160, 500, 450));
    f.document.dispatchEvent(new f.window.Event('scroll'));
    f.resize();
    f.resize();
    expect(f.callbacks.size).toBe(1);
    f.flush();
    expect(f.host.style.left).toBe('768px');
    expect(f.host.style.top).toBe('172px');
    expect(f.video.parentElement).toBe(f.root);
    expect(f.root.hasAttribute('style')).toBe(false);
  });

  it('moves left of native top-right controls, including controls revealed on hover', () => {
    const f = setup();
    f.menu(748, 112);
    f.pointer(600, 200);
    f.flush();
    expect(f.host.hasAttribute('data-video-hover')).toBe(true);
    expect(f.host.style.left).toBe('700px');
    f.pointer(10, 10);
    expect(f.host.hasAttribute('data-video-hover')).toBe(false);
  });

  it('uses the visible canvas when the native video is transparent', () => {
    const f = setup();
    f.root.id = 'xgwrapper-0-123';
    f.video.style.opacity = '0';
    const canvas = f.root.querySelector('canvas');
    if (!canvas) throw new Error('Missing canvas');
    canvas.getBoundingClientRect = () => rect(250, 150, 400, 600);
    f.resize();
    f.flush();
    expect(f.host.style.left).toBe('598px');
    expect(f.host.style.top).toBe('162px');
    expect(f.observe).toHaveBeenCalledWith(canvas);
  });

  it('hides outside the viewport or in fullscreen and reappears on exit', () => {
    const f = setup();
    f.move(rect(200, -20, 600, 500));
    f.resize();
    f.flush();
    expect(f.host.hidden).toBe(true);
    f.move(rect(200, 100, 600, 500));
    f.setFullscreen(f.root);
    f.flush();
    expect(f.host.hidden).toBe(true);
    f.setFullscreen(null);
    f.flush();
    expect(f.host.hidden).toBe(false);
  });

  it('switches media and removes geometry observers and pending frames on disposal', () => {
    const f = setup();
    const next = f.document.createElement('video');
    next.getBoundingClientRect = () => rect(300, 200, 400, 600);
    f.root.append(next);
    f.anchor.update(next);
    f.flush();
    expect(f.host.style.left).toBe('648px');
    expect(f.host.style.top).toBe('212px');
    f.anchor.update(null);
    f.flush();
    expect(f.host.hidden).toBe(true);
    f.anchor.update(next);
    f.anchor.dispose();
    expect(f.callbacks.size).toBe(0);
    expect(f.disconnect).toHaveBeenCalled();
    f.anchor.update(next);
    expect(f.callbacks.size).toBe(0);
  });
});
