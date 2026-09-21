import { describe, expect, it, vi } from 'vitest';

import { createTikTokAdapter } from '../../src/tiktok/adapter';
import { loadFixture, setVideoState } from './dom-fixture';

describe('TikTok event observation', () => {
  it('rechecks the route identity when a player wrapper ID changes', async () => {
    const fixture = loadFixture('modern-detail');
    fixture.location.href = 'https://www.tiktok.com/@fixture/video/123';
    const video = fixture.video('modern-detail');
    video.parentElement?.setAttribute('id', 'xgwrapper-0-456');
    setVideoState(video, { top: 100 });
    const adapter = createTikTokAdapter(fixture);
    const listener = vi.fn();
    adapter.observeActiveVideo(listener);
    expect(listener.mock.calls.at(-1)?.[0]).toMatchObject({ identity: null });
    video.parentElement?.setAttribute('id', 'xgwrapper-0-123');
    await fixture.flush();
    expect(listener.mock.calls.at(-1)?.[0]).toMatchObject({ identity: { videoId: '123' } });
    adapter.dispose();
  });
  it('notifies immediately, deduplicates unchanged events, and switches on scroll', async () => {
    const fixture = loadFixture('feed');
    setVideoState(fixture.video('first'), { top: 100 });
    const adapter = createTikTokAdapter(fixture);
    const listener = vi.fn();
    const stop = adapter.observeActiveVideo(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ identity: { videoId: '111' } });

    fixture.document.dispatchEvent(new fixture.window.Event('scroll'));
    fixture.document.dispatchEvent(new fixture.window.Event('scroll'));
    expect(fixture.frames.size).toBe(1);
    await fixture.flush();
    expect(listener).toHaveBeenCalledTimes(1);

    setVideoState(fixture.video('first'), { top: -900 });
    setVideoState(fixture.video('second'), { top: 100 });
    fixture.document.dispatchEvent(new fixture.window.Event('scroll'));
    await fixture.flush();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1]?.[0]).toMatchObject({ identity: { videoId: '222' } });
    stop();
    adapter.dispose();
  });

  it('tracks added and removed videos without querying the whole document again', async () => {
    const fixture = loadFixture('feed');
    const scan = vi.spyOn(fixture.document, 'querySelectorAll');
    const adapter = createTikTokAdapter(fixture);
    const listener = vi.fn();
    adapter.observeActiveVideo(listener);
    expect(listener).toHaveBeenLastCalledWith(null);
    const scansAfterStart = scan.mock.calls.length;

    const article = fixture.document.createElement('article');
    article.innerHTML = '<video id="third"></video><a href="/@third_creator/video/333">Third</a>';
    fixture.document.body.append(article);
    setVideoState(fixture.video('third'), { top: 100 });
    await fixture.flush();
    expect(listener.mock.calls.at(-1)?.[0]).toMatchObject({ identity: { videoId: '333' } });
    expect(scan).toHaveBeenCalledTimes(scansAfterStart);

    article.remove();
    await fixture.flush();
    expect(listener).toHaveBeenLastCalledWith(null);
    adapter.dispose();
  });

  it('notifies when a recycled player receives a new local permalink', async () => {
    const fixture = loadFixture('feed');
    setVideoState(fixture.video('first'), { top: 100 });
    const adapter = createTikTokAdapter(fixture);
    const listener = vi.fn();
    adapter.observeActiveVideo(listener);

    fixture.document
      .querySelector('#first-card a')
      ?.setAttribute('href', '/@new_creator/video/444');
    await fixture.flush();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1]?.[0]).toMatchObject({ identity: { videoId: '444' } });
    adapter.dispose();
  });

  it('reports Navigation API and fallback URL changes once without patching history', async () => {
    const fixture = loadFixture('feed');
    const adapter = createTikTokAdapter(fixture);
    const listener = vi.fn();
    adapter.observeNavigation(listener);
    expect(listener).toHaveBeenLastCalledWith({ url: fixture.location.href, videoIdentity: null });

    fixture.location.href = 'https://www.tiktok.com/@creator_one/video/111';
    fixture.navigation.dispatchEvent(new fixture.window.Event('currententrychange'));
    fixture.navigation.dispatchEvent(new fixture.window.Event('navigatesuccess'));
    await fixture.flush();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1]?.[0]).toMatchObject({ videoIdentity: { videoId: '111' } });

    fixture.location.href = 'https://www.tiktok.com/@creator_two/video/222';
    fixture.document.body.append(fixture.document.createElement('p'));
    await fixture.flush();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener.mock.calls[2]?.[0]).toMatchObject({ videoIdentity: { videoId: '222' } });

    fixture.location.href = 'https://www.tiktok.com/foryou';
    fixture.window.dispatchEvent(new fixture.window.Event('popstate'));
    await fixture.flush();
    expect(listener).toHaveBeenLastCalledWith({ url: fixture.location.href, videoIdentity: null });
    adapter.dispose();
  });

  it('ignores extension-owned overlay updates', async () => {
    const fixture = loadFixture('feed');
    const overlay = fixture.document.createElement('div');
    overlay.setAttribute('data-tiktok-focus-owned', '');
    fixture.document.body.append(overlay);
    const adapter = createTikTokAdapter(fixture);
    adapter.observeActiveVideo(vi.fn());

    overlay.append(fixture.document.createElement('span'));
    overlay.setAttribute('style', 'color: red');
    await Promise.resolve();
    expect(fixture.frames.size).toBe(0);
    adapter.dispose();
  });

  it('last unsubscribe cancels pending work and removes observation until subscribed again', async () => {
    const fixture = loadFixture('feed');
    const adapter = createTikTokAdapter(fixture);
    const listener = vi.fn();
    const stop = adapter.observeActiveVideo(listener);
    fixture.window.dispatchEvent(new fixture.window.Event('resize'));
    expect(fixture.frames.size).toBe(1);
    stop();
    stop();
    expect(fixture.frames.size).toBe(0);

    fixture.document.body.append(fixture.document.createElement('p'));
    fixture.window.dispatchEvent(new fixture.window.Event('resize'));
    await fixture.flush();
    expect(fixture.frames.size).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);

    setVideoState(fixture.video('first'), { top: 100 });
    const stopAgain = adapter.observeActiveVideo(listener);
    expect(listener.mock.calls.at(-1)?.[0]).toMatchObject({ identity: { videoId: '111' } });
    stopAgain();
    adapter.dispose();
  });

  it('reports a hidden document before animation frames can run', () => {
    const fixture = loadFixture('feed');
    setVideoState(fixture.video('first'), { top: 100 });
    const adapter = createTikTokAdapter(fixture);
    const listener = vi.fn();
    adapter.observeActiveVideo(listener);
    Object.defineProperty(fixture.document, 'visibilityState', { value: 'hidden' });
    fixture.document.dispatchEvent(new fixture.window.Event('visibilitychange'));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(null);
    expect(fixture.frames.size).toBe(0);
    adapter.dispose();
  });

  it('disconnects intersections and ignores queued callbacks after the last unsubscribe', () => {
    const fixture = loadFixture('feed');
    const observe = vi.fn();
    const unobserve = vi.fn();
    const disconnect = vi.fn();
    let callback: (() => void) | undefined;
    const original = Object.getOwnPropertyDescriptor(fixture.window, 'IntersectionObserver');
    Object.defineProperty(fixture.window, 'IntersectionObserver', {
      configurable: true,
      value: class {
        constructor(listener: () => void) {
          callback = listener;
        }
        observe = observe;
        unobserve = unobserve;
        disconnect = disconnect;
      },
    });
    try {
      const adapter = createTikTokAdapter(fixture);
      const stop = adapter.observeActiveVideo(vi.fn());
      expect(observe).toHaveBeenCalledTimes(2);
      stop();
      expect(disconnect).toHaveBeenCalledTimes(1);
      callback?.();
      expect(fixture.frames.size).toBe(0);
      adapter.dispose();
    } finally {
      if (original) Object.defineProperty(fixture.window, 'IntersectionObserver', original);
      else Reflect.deleteProperty(fixture.window, 'IntersectionObserver');
    }
  });

  it('disposal stops every subscription and refuses further DOM operations', async () => {
    const fixture = loadFixture('feed');
    const adapter = createTikTokAdapter(fixture);
    const active = vi.fn();
    const navigation = vi.fn();
    adapter.observeActiveVideo(active);
    adapter.observeNavigation(navigation);
    fixture.window.dispatchEvent(new fixture.window.Event('resize'));
    adapter.dispose();
    fixture.location.href = 'https://www.tiktok.com/@creator/video/444';
    fixture.navigation.dispatchEvent(new fixture.window.Event('navigatesuccess'));
    fixture.document.body.append(fixture.document.createElement('p'));
    await fixture.flush();

    expect(fixture.frames.size).toBe(0);
    expect(active).toHaveBeenCalledTimes(1);
    expect(navigation).toHaveBeenCalledTimes(1);
    expect(() => adapter.getVideoElement()).toThrow('TikTok adapter has been disposed.');
    expect(() => adapter.observeNavigation(navigation)).toThrow(
      'TikTok adapter has been disposed.',
    );
  });
});
