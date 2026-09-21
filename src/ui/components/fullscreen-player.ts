import styles from '../styles/fullscreen-player.css?inline';

export interface FullscreenPlayer {
  readonly element: HTMLElement;
  focus(): void;
  showStatus(message: string, error?: boolean): void;
  dispose(): void;
}

export function formatPlayerTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const tail = `${String(total % 60).padStart(2, '0')}`;
  return minutes < 60
    ? `${minutes}:${tail}`
    : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${tail}`;
}

const ICONS = {
  play: 'M8 5v14l11-7z',
  pause: 'M9 5v14M15 5v14',
  volume: 'M11 5 6 9H3v6h3l5 4zM15 8c3 2 3 6 0 8M18 5c5 4 5 10 0 14',
  muted: 'M11 5 6 9H3v6h3l5 4zM16 9l6 6M22 9l-6 6',
  exit: 'M9 3v6H3M15 3v6h6M3 15h6v6M21 15h-6v6',
} as const;

/** Generic media UI. No TikTok selectors, storage, or fullscreen ownership live here. */
export function createFullscreenPlayer(
  media: HTMLVideoElement,
  options: { title: string; onExit: () => void },
  doc: Document = media.ownerDocument,
): FullscreenPlayer {
  const lifetime = new AbortController();
  const events = { signal: lifetime.signal };
  const host = doc.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = styles;
  const player = doc.createElement('div');
  player.className = 'player';
  player.tabIndex = -1;
  player.setAttribute('aria-label', 'Fullscreen video player');
  const surface = doc.createElement('button');
  surface.className = 'surface';
  surface.type = 'button';
  surface.tabIndex = -1;
  surface.setAttribute('aria-label', 'Play or pause');
  const header = doc.createElement('div');
  header.className = 'chrome header';
  const title = doc.createElement('span');
  title.className = 'title';
  title.textContent = options.title;
  const hint = doc.createElement('span');
  hint.className = 'hint';
  hint.textContent = 'Space to pause · ← → to seek · Esc to exit';
  header.append(title, hint);
  const controls = doc.createElement('div');
  controls.className = 'chrome controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Playback controls');
  const seekWrap = doc.createElement('div');
  seekWrap.className = 'seek-wrap';
  const seek = doc.createElement('input');
  seek.type = 'range';
  seek.className = 'seek';
  seek.min = '0';
  seek.max = '0';
  seek.step = '0.1';
  seek.setAttribute('aria-label', 'Seek');
  const preview = doc.createElement('span');
  preview.className = 'preview';
  preview.hidden = true;
  seekWrap.append(seek, preview);
  const row = doc.createElement('div');
  row.className = 'row';

  function button(label: string, action: () => void, icon?: keyof typeof ICONS): HTMLButtonElement {
    const element = doc.createElement('button');
    element.type = 'button';
    element.className = 'control';
    element.setAttribute('aria-label', label);
    element.title = label;
    if (icon) setIcon(element, icon);
    element.addEventListener('click', action, events);
    return element;
  }
  function setIcon(element: HTMLButtonElement, name: keyof typeof ICONS): void {
    if (element.dataset.icon === name) return;
    element.dataset.icon = name;
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[name]);
    path.setAttribute('fill', name === 'play' ? 'currentColor' : 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
    element.replaceChildren(svg);
  }
  const play = button('Pause (Space)', togglePlayback, 'pause');
  const rewind = button('Back 10 seconds (J)', () => seekTo(media.currentTime - 10));
  rewind.classList.add('skip');
  rewind.textContent = '−10';
  const forward = button('Forward 10 seconds (L)', () => seekTo(media.currentTime + 10));
  forward.classList.add('skip');
  forward.textContent = '+10';
  const mute = button('Mute (M)', toggleMute, 'volume');
  const volume = doc.createElement('input');
  volume.type = 'range';
  volume.className = 'volume';
  volume.min = '0';
  volume.max = '1';
  volume.step = '0.05';
  volume.setAttribute('aria-label', 'Volume');
  const time = doc.createElement('span');
  time.className = 'time';
  const spacer = doc.createElement('span');
  spacer.className = 'spacer';
  const speed = doc.createElement('select');
  speed.setAttribute('aria-label', 'Playback speed');
  for (const rate of [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]) {
    const option = doc.createElement('option');
    option.value = String(rate);
    option.textContent = `${rate}×`;
    speed.append(option);
  }
  const exit = button('Exit fullscreen (Esc)', options.onExit, 'exit');
  const message = doc.createElement('div');
  message.className = 'message';
  message.setAttribute('role', 'status');
  const saved = doc.createElement('p');
  saved.className = 'chrome saved';
  row.append(play, rewind, forward, mute, volume, time, spacer, speed, exit);
  controls.append(seekWrap, row);
  player.append(surface, header, message, saved, controls);
  shadow.append(style, player);

  let scrubbing = false;
  let hoveringControls = false;
  let keyboardNavigation = false;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let failure = '';

  function reveal(): void {
    player.removeAttribute('data-idle');
    clearTimeout(hideTimer);
    hideTimer = undefined;
    if (
      media.paused ||
      media.ended ||
      scrubbing ||
      hoveringControls ||
      keyboardNavigation ||
      failure
    )
      return;
    hideTimer = setTimeout(() => {
      if (!lifetime.signal.aborted && shadow.activeElement !== speed)
        player.setAttribute('data-idle', '');
    }, 2500);
  }
  function fail(text: string): void {
    failure = text;
    render();
    reveal();
  }
  function togglePlayback(): void {
    failure = '';
    if (media.paused || media.ended) {
      void media.play().catch(() => {
        if (!lifetime.signal.aborted) fail('Playback could not start. Try Play again.');
      });
    } else media.pause();
    reveal();
  }
  function toggleMute(): void {
    media.muted = !media.muted;
    if (!media.muted && media.volume === 0) media.volume = 0.5;
    render();
    reveal();
  }
  function seekTo(value: number): void {
    if (!Number.isFinite(value) || !Number.isFinite(media.duration) || media.duration <= 0) return;
    try {
      media.currentTime = Math.min(media.duration, Math.max(0, value));
      failure = '';
    } catch {
      failure = 'This position is not available yet.';
    }
    render();
    reveal();
  }
  function render(): void {
    const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0;
    const position = scrubbing
      ? Number(seek.value)
      : Number.isFinite(media.currentTime)
        ? Math.max(0, media.currentTime)
        : 0;
    seek.disabled = rewind.disabled = forward.disabled = duration === 0;
    seek.max = String(duration);
    if (!scrubbing) seek.value = String(Math.min(position, duration));
    seek.setAttribute(
      'aria-valuetext',
      `${formatPlayerTime(position)} of ${duration ? formatPlayerTime(duration) : 'unknown duration'}`,
    );
    const played = duration ? Math.min(100, (position / duration) * 100) : 0;
    let buffered = played;
    for (let index = 0; index < media.buffered.length; index++) {
      if (media.buffered.start(index) <= position && media.buffered.end(index) >= position)
        buffered = duration
          ? Math.max(played, Math.min(100, (media.buffered.end(index) / duration) * 100))
          : played;
    }
    seek.style.setProperty('--played', `${played}%`);
    seek.style.setProperty('--buffered', `${buffered}%`);
    time.textContent = `${formatPlayerTime(position)} / ${duration ? formatPlayerTime(duration) : '–:––'}`;
    setIcon(play, media.paused || media.ended ? 'play' : 'pause');
    play.setAttribute('aria-label', media.paused || media.ended ? 'Play (Space)' : 'Pause (Space)');
    play.title = play.getAttribute('aria-label') ?? '';
    const muted = media.muted || media.volume === 0;
    setIcon(mute, muted ? 'muted' : 'volume');
    mute.setAttribute('aria-label', muted ? 'Unmute (M)' : 'Mute (M)');
    mute.title = mute.getAttribute('aria-label') ?? '';
    volume.value = String(muted ? 0 : media.volume);
    const rateOption = Array.from(speed.options).find(
      (option) => option.value === String(media.playbackRate),
    );
    if (rateOption) rateOption.selected = true;
    message.textContent =
      failure ||
      (media.error
        ? 'Video could not be loaded.'
        : media.seeking || (!media.paused && media.readyState < 3)
          ? 'Loading video…'
          : '');
    if (media.paused || media.ended) reveal();
  }
  seek.addEventListener(
    'input',
    () => {
      scrubbing = true;
      render();
      reveal();
    },
    events,
  );
  seek.addEventListener(
    'change',
    () => {
      const target = Number(seek.value);
      scrubbing = false;
      seekTo(target);
    },
    events,
  );
  seek.addEventListener(
    'pointercancel',
    () => {
      scrubbing = false;
      render();
      reveal();
    },
    events,
  );
  seekWrap.addEventListener(
    'pointermove',
    (event) => {
      if (seek.disabled) return;
      const bounds = seek.getBoundingClientRect();
      if (bounds.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      preview.textContent = formatPlayerTime(ratio * media.duration);
      preview.style.left = `${Math.max(32, Math.min(bounds.width - 32, ratio * bounds.width))}px`;
      preview.hidden = false;
    },
    events,
  );
  seekWrap.addEventListener(
    'pointerleave',
    () => {
      preview.hidden = true;
    },
    events,
  );
  volume.addEventListener(
    'input',
    () => {
      media.volume = Math.max(0, Math.min(1, Number(volume.value)));
      media.muted = media.volume === 0;
      render();
      reveal();
    },
    events,
  );
  speed.addEventListener(
    'change',
    () => {
      const rate = Number(speed.value);
      if (Number.isFinite(rate) && rate >= 0.5 && rate <= 2) media.playbackRate = rate;
      reveal();
    },
    events,
  );
  surface.addEventListener('click', togglePlayback, events);
  player.addEventListener('pointermove', reveal, events);
  player.addEventListener(
    'pointerdown',
    () => {
      keyboardNavigation = false;
      reveal();
    },
    events,
  );
  controls.addEventListener(
    'pointerenter',
    () => {
      hoveringControls = true;
      reveal();
    },
    events,
  );
  controls.addEventListener(
    'pointerleave',
    () => {
      hoveringControls = false;
      reveal();
    },
    events,
  );
  player.addEventListener('focusin', reveal, events);
  speed.addEventListener('blur', reveal, events);
  // Keep site click handlers from toggling playback a second time.
  for (const type of ['click', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup'])
    host.addEventListener(type, (event) => event.stopPropagation(), events);

  const keyboardTarget = doc.defaultView ?? doc;
  keyboardTarget.addEventListener(
    'keydown',
    (event: Event) => {
      if (host.hidden || !host.isConnected) return;
      const key = event as KeyboardEvent;
      if (key.ctrlKey || key.metaKey || key.altKey || key.key === 'Escape') return;
      const target = key.composedPath()[0];
      const tag = target && 'tagName' in target ? target.tagName : '';
      if (key.key === 'Tab') keyboardNavigation = true;
      reveal();
      key.stopPropagation();
      if (key.key === 'Tab') {
        const available = Array.from(
          controls.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
            'button, input, select',
          ),
        ).filter((element) => !element.disabled);
        const first = available[0];
        const last = available.at(-1);
        const focused = shadow.activeElement;
        if (
          key.shiftKey &&
          (focused === first || !available.some((element) => element === focused))
        ) {
          key.preventDefault();
          last?.focus();
        } else if (
          !key.shiftKey &&
          (focused === last || !available.some((element) => element === focused))
        ) {
          key.preventDefault();
          first?.focus();
        }
        return;
      }
      if (tag === 'INPUT' || tag === 'SELECT') return;
      if (tag === 'BUTTON' && (key.key === ' ' || key.key === 'Enter')) return;
      switch (key.key.toLowerCase()) {
        case ' ':
        case 'k':
          if (!key.repeat) togglePlayback();
          break;
        case 'arrowleft':
          seekTo(media.currentTime - 5);
          break;
        case 'arrowright':
          seekTo(media.currentTime + 5);
          break;
        case 'j':
          seekTo(media.currentTime - 10);
          break;
        case 'l':
          seekTo(media.currentTime + 10);
          break;
        case 'm':
          if (!key.repeat) toggleMute();
          break;
        case 'f':
          options.onExit();
          break;
        default:
          return;
      }
      key.preventDefault();
    },
    { ...events, capture: true },
  );

  for (const event of [
    'timeupdate',
    'durationchange',
    'loadedmetadata',
    'progress',
    'volumechange',
    'ratechange',
    'waiting',
    'seeking',
    'canplay',
    'seeked',
    'error',
  ])
    media.addEventListener(event, render, events);
  for (const event of ['play', 'playing', 'pause', 'ended'])
    media.addEventListener(
      event,
      () => {
        render();
        reveal();
      },
      events,
    );
  render();
  reveal();

  return {
    element: host,
    focus: () => player.focus({ preventScroll: true }),
    showStatus(text, error = false) {
      saved.textContent = text;
      saved.toggleAttribute('data-error', error);
      if (error) reveal();
    },
    dispose() {
      lifetime.abort();
      clearTimeout(hideTimer);
      host.remove();
    },
  };
}
