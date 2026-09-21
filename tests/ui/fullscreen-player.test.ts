import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFullscreenPlayer,
  formatPlayerTime,
} from '../../src/ui/components/fullscreen-player';
import { mediaFixture } from './media-fixture';

const dispose: (() => void)[] = [];
afterEach(() => {
  for (const stop of dispose.splice(0)) stop();
  vi.useRealTimers();
});
function setup() {
  const fixture = mediaFixture();
  const onExit = vi.fn();
  const view = createFullscreenPlayer(
    fixture.video,
    { title: '@fixture', onExit },
    fixture.document,
  );
  fixture.root.append(view.element);
  dispose.push(() => view.dispose());
  const shadow = view.element.shadowRoot;
  if (!shadow) throw new Error('Missing player');
  function control<T extends HTMLElement>(label: string): T {
    const result = shadow!.querySelector<T>(`[aria-label="${label}"]`);
    if (!result) throw new Error(`Missing ${label}`);
    return result;
  }
  return { ...fixture, view, shadow, control, onExit };
}

describe('fullscreen media controls', () => {
  it('handles shortcuts without stealing arrow keys from sliders or acting after disposal', () => {
    const { window, shadow, video, control, view, pause } = setup();
    const target = shadow.querySelector('.player');
    const key = (value: string, source: EventTarget | null = target) => {
      const event = new window.Event('keydown', { cancelable: true });
      Object.defineProperties(event, { key: { value }, composedPath: { value: () => [source] } });
      window.dispatchEvent(event);
    };
    key('ArrowRight');
    expect(video.currentTime).toBe(17);
    key('ArrowLeft', control('Seek'));
    expect(video.currentTime).toBe(17);
    key(' ');
    expect(pause).toHaveBeenCalledOnce();
    view.dispose();
    key('ArrowRight');
    expect(video.currentTime).toBe(17);
  });
  it('formats long videos and rejects invalid display times', () => {
    expect(formatPlayerTime(3661.9)).toBe('1:01:01');
    expect(formatPlayerTime(Infinity)).toBe('0:00');
  });
  it('seeks only when the scrub is committed and preserves the preview during playback', () => {
    const { control, video, emit, window } = setup();
    const seek = control<HTMLInputElement>('Seek');
    seek.value = '75';
    seek.dispatchEvent(new window.Event('input'));
    expect(video.currentTime).toBe(12);
    video.currentTime = 14;
    emit('timeupdate');
    expect(seek.value).toBe('75');
    seek.dispatchEvent(new window.Event('change'));
    expect(video.currentTime).toBe(75);
  });
  it('handles play, mute, volume, playback rate and exit with native controls', () => {
    const { control, video, pause, window, onExit } = setup();
    control('Pause (Space)').click();
    expect(pause).toHaveBeenCalledOnce();
    control('Mute (M)').click();
    expect(video.muted).toBe(true);
    const volume = control<HTMLInputElement>('Volume');
    volume.value = '0.4';
    volume.dispatchEvent(new window.Event('input'));
    expect(video.volume).toBe(0.4);
    expect(video.muted).toBe(false);
    const rate = control<HTMLSelectElement>('Playback speed');
    const faster = Array.from(rate.options).find((option) => option.value === '1.5');
    if (!faster) throw new Error('Missing speed option');
    faster.selected = true;
    rate.dispatchEvent(new window.Event('change'));
    expect(video.playbackRate).toBe(1.5);
    control('Exit fullscreen (Esc)').click();
    expect(onExit).toHaveBeenCalledOnce();
  });
  it('disables seeking for unavailable durations and clamps skip buttons at the boundaries', () => {
    const { control, video, emit } = setup();
    video.currentTime = 118;
    control('Forward 10 seconds (L)').click();
    expect(video.currentTime).toBe(120);
    Object.defineProperty(video, 'duration', { value: Infinity, writable: true });
    emit('durationchange');
    expect(control<HTMLInputElement>('Seek').disabled).toBe(true);
    expect(control<HTMLButtonElement>('Back 10 seconds (J)').disabled).toBe(true);
  });
  it('auto-hides while playing and keeps controls visible while paused; disposes timers', () => {
    vi.useFakeTimers();
    const { shadow, video, emit, view, window } = setup();
    const player = shadow.querySelector('.player');
    vi.advanceTimersByTime(2500);
    expect(player?.hasAttribute('data-idle')).toBe(true);
    player?.dispatchEvent(new window.Event('pointermove'));
    expect(player?.hasAttribute('data-idle')).toBe(false);
    Object.defineProperty(video, 'paused', { value: true, writable: true });
    emit('pause');
    vi.advanceTimersByTime(3000);
    expect(player?.hasAttribute('data-idle')).toBe(false);
    view.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('shows playback failures instead of leaving a misleading play state', async () => {
    const { video, play, emit, control, shadow } = setup();
    Object.defineProperty(video, 'paused', { value: true, writable: true });
    emit('pause');
    play.mockRejectedValueOnce(new Error('Not allowed'));
    control('Play (Space)').click();
    await Promise.resolve();
    expect(shadow.querySelector('[role="status"]')?.textContent).toContain(
      'Playback could not start',
    );
  });
});
