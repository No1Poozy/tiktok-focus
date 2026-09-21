import { describe, expect, it } from 'vitest';

import { createTikTokAdapter } from '../../src/tiktok/adapter';
import { loadFixture, setVideoState } from './dom-fixture';

describe('fixture-backed active video selection', () => {
  it('does not borrow a neighbouring permalink when that card has no loaded video', () => {
    const fixture = loadFixture('modern-feed');
    const first = fixture.document.querySelector('#feed-first');
    const second = fixture.document.querySelector('#feed-second');
    if (!first || !second) throw new Error('Missing feed cards');
    first.querySelector('a[data-e2e="video-author-avatar"]')?.remove();
    fixture.video('second').remove();
    const link = fixture.document.createElement('a');
    link.setAttribute('href', '/@creator_two/video/222');
    second.append(link);
    const list = fixture.document.createElement('div');
    fixture.document.querySelector('main')?.append(list);
    list.append(first, second);
    setVideoState(fixture.video('first'), { top: 100 });
    expect(createTikTokAdapter(fixture).getActiveVideo()?.identity).toBeNull();
  });
  it('identifies feed cards without permalinks and keeps their creator and metadata separate', () => {
    const fixture = loadFixture('modern-feed');
    fixture.location.href = 'https://www.tiktok.com/foryou';
    setVideoState(fixture.video('first'), { top: 100 });
    const adapter = createTikTokAdapter(fixture);
    const first = adapter.getActiveVideo();
    expect(first?.identity).toEqual({
      videoId: '111',
      creator: 'creator_one',
      canonicalUrl: 'https://www.tiktok.com/@creator_one/video/111',
    });
    if (!first) throw new Error('Missing first card');
    expect(adapter.extractMetadata(first).caption).toBe('First synthetic caption. Mention');
    setVideoState(fixture.video('first'), { top: -900 });
    setVideoState(fixture.video('second'), { top: 100 });
    expect(adapter.getActiveVideo()?.identity).toEqual({
      videoId: '222',
      creator: 'creator_two',
      canonicalUrl: 'https://www.tiktok.com/@creator_two/video/222',
    });
  });
  it.each([
    'missing-author',
    'conflicting-authors',
    'invalid-author',
    'missing-id',
    'multiple-videos',
    'conflicting-permalink',
  ])('does not guess feed identity with %s', (variant) => {
    const fixture = loadFixture('modern-feed');
    setVideoState(fixture.video('first'), { top: 100 });
    const card = fixture.document.querySelector('#feed-first');
    const author = card?.querySelector('a[data-e2e="video-author-avatar"]');
    if (!card || !author) throw new Error('Missing card');
    if (variant === 'missing-author') author.remove();
    if (variant === 'conflicting-authors') {
      const other = author.cloneNode(true) as Element;
      other.setAttribute('href', '/@wrong_creator');
      card.append(other);
    }
    if (variant === 'invalid-author')
      author.setAttribute('href', 'https://evil.example/@creator_one');
    if (variant === 'missing-id')
      fixture.document.querySelector('[id^="xgwrapper-"]')?.removeAttribute('id');
    if (variant === 'multiple-videos') card.append(fixture.document.createElement('video'));
    if (variant === 'conflicting-permalink') {
      // Contradictory links must not become a guessed card identity.
      const link = fixture.document.createElement('a');
      link.setAttribute('href', '/@wrong_creator/video/999');
      card.append(link);
      // A second conflicting link ensures the direct permalink path is ambiguous too.
      const other = fixture.document.createElement('a');
      other.setAttribute('href', '/@creator_one/video/111');
      card.append(other);
    }
    expect(createTikTokAdapter(fixture).getActiveVideo()?.identity).toBeNull();
  });
  it('keeps the direct-link identity when another detail player is preloaded', () => {
    const fixture = loadFixture('modern-detail');
    fixture.location.href = 'https://www.tiktok.com/@fixture/video/123';
    const video = fixture.video('modern-detail');
    video.parentElement?.setAttribute('id', 'xgwrapper-0-123');
    setVideoState(video, { top: 100 });
    const preload = fixture.document.createElement('section');
    preload.setAttribute('data-e2e', 'feed-video');
    preload.innerHTML = '<div id="xgwrapper-1-456"><video id="preload"></video></div>';
    fixture.document.body.append(preload);
    setVideoState(fixture.video('preload'), { top: 900 });
    const adapter = createTikTokAdapter(fixture);
    expect(adapter.getActiveVideo()?.identity?.videoId).toBe('123');
    // During navigation the media may change before the URL does.
    video.parentElement?.setAttribute('id', 'xgwrapper-0-789');
    expect(adapter.getActiveVideo()?.identity).toBeNull();
  });
  it.each(['visible', 'hidden', 'offscreen', 'ambiguous', 'unrelated'])(
    'handles a %s canvas presentation without treating hidden preloads as active',
    (variant) => {
      const fixture = loadFixture('canvas-detail');
      fixture.location.href = 'https://www.tiktok.com/@fixture/video/123';
      const video = fixture.video('canvas-video');
      setVideoState(video, { top: 100, paused: true });
      const canvas = fixture.document.querySelector('#frames');
      if (!canvas) throw new Error('Missing canvas');
      Object.defineProperty(canvas, 'getBoundingClientRect', {
        value: () => ({
          top: variant === 'offscreen' ? 900 : 100,
          bottom: variant === 'offscreen' ? 1100 : 300,
          left: 400,
          right: 720,
          width: 320,
          height: 200,
        }),
      });
      if (variant === 'hidden') canvas.setAttribute('data-test-opacity', '0');
      if (variant === 'ambiguous')
        video.parentElement?.append(fixture.document.createElement('video'));
      if (variant === 'unrelated') fixture.document.body.append(canvas);
      const active = createTikTokAdapter(fixture).getActiveVideo();
      if (variant === 'visible') {
        expect(active?.element).toBe(video);
        expect(active?.identity?.videoId).toBe('123');
      } else expect(active).toBeNull();
    },
  );
  it('recognizes the feed-style player observed on current public permalink pages', () => {
    const fixture = loadFixture('modern-detail');
    fixture.location.href = 'https://www.tiktok.com/@fixture/video/123';
    setVideoState(fixture.video('modern-detail'), { top: 100 });
    expect(createTikTokAdapter(fixture).getActiveVideo()?.identity?.videoId).toBe('123');
    fixture.location.href = 'https://www.tiktok.com/foryou';
    expect(createTikTokAdapter(fixture).getActiveVideo()?.identity).toBeNull();
  });
  it('finds a permalink surrounding the anonymous Explore player six ancestors up', () => {
    const fixture = loadFixture('feed');
    fixture.document.body.innerHTML =
      '<main><a href="/@explore_creator/video/456"><div><div><div><div><div><video id="explore"></video></div></div></div></div></div></a></main>';
    setVideoState(fixture.video('explore'), { top: 100 });
    expect(createTikTokAdapter(fixture).getActiveVideo()?.identity?.videoId).toBe('456');
  });

  it('selects a visible paused video over an offscreen autoplay preload', () => {
    const fixture = loadFixture('feed');
    setVideoState(fixture.video('first'), { top: 100, paused: true });
    setVideoState(fixture.video('second'), { top: 850, paused: false });
    const adapter = createTikTokAdapter(fixture);

    expect(adapter.getActiveVideo()?.identity).toEqual({
      videoId: '111',
      creator: 'creator_one',
      canonicalUrl: 'https://www.tiktok.com/@creator_one/video/111',
    });
    expect(adapter.getVideoElement()).toBe(fixture.video('first'));
  });

  it('uses playback evidence to distinguish equally visible players', () => {
    const fixture = loadFixture('feed');
    setVideoState(fixture.video('first'), { top: 100, paused: true });
    setVideoState(fixture.video('second'), { top: 100, paused: false });
    expect(createTikTokAdapter(fixture).getVideoElement()).toBe(fixture.video('second'));
  });

  it('does not borrow the identity of a neighbouring card', () => {
    const fixture = loadFixture('feed');
    setVideoState(fixture.video('first'), { top: 100 });
    fixture.document.querySelector('#first-card a')?.remove();
    fixture.location.href = 'https://www.tiktok.com/@stale_creator/video/333';
    expect(createTikTokAdapter(fixture).getActiveVideo()?.identity).toBeNull();
  });

  it('rejects conflicting local permalinks instead of guessing', () => {
    const fixture = loadFixture('feed');
    setVideoState(fixture.video('first'), { top: 100 });
    const conflicting = fixture.document.createElement('a');
    conflicting.href = '/@different/video/333';
    fixture.document.querySelector('#first-card')?.append(conflicting);
    expect(createTikTokAdapter(fixture).getActiveVideo()?.identity).toBeNull();
  });

  it('uses the detail URL only for the verified detail player', () => {
    const fixture = loadFixture('detail');
    fixture.location.href = 'https://www.tiktok.com/@detail_creator/video/123';
    setVideoState(fixture.video('detail'), { top: 100 });
    const adapter = createTikTokAdapter(fixture);
    expect(adapter.getActiveVideo()?.identity?.videoId).toBe('123');

    setVideoState(fixture.video('detail'), { top: -900 });
    setVideoState(fixture.video('recommendation'), { top: 100 });
    expect(adapter.getActiveVideo()?.identity?.videoId).toBe('999');
  });

  it('does not guess a detail identity when two detail players exist', () => {
    const fixture = loadFixture('detail');
    fixture.location.href = 'https://www.tiktok.com/@detail_creator/video/123';
    setVideoState(fixture.video('detail'), { top: 100 });
    fixture.video('recommendation').parentElement?.setAttribute('data-e2e', 'browse-video');
    expect(createTikTokAdapter(fixture).getActiveVideo()?.identity).toBeNull();
  });

  it.each(['hidden', 'transparent', 'tiny', 'owned', 'background'])(
    'does not select a %s video',
    (variant) => {
      const fixture = loadFixture('feed');
      const video = fixture.video('first');
      setVideoState(video, { top: 100, ...(variant === 'tiny' ? { width: 20 } : {}) });
      if (variant === 'hidden') video.setAttribute('data-test-visibility', 'hidden');
      if (variant === 'transparent') video.setAttribute('data-test-opacity', '0');
      if (variant === 'owned') video.parentElement?.setAttribute('data-tiktok-focus-owned', '');
      if (variant === 'background') {
        Object.defineProperty(fixture.document, 'visibilityState', { value: 'hidden' });
      }
      expect(createTikTokAdapter(fixture).getActiveVideo()).toBeNull();
    },
  );

  it('reads only the selected card metadata and validates optional media values', () => {
    const fixture = loadFixture('feed');
    const video = fixture.video('first');
    setVideoState(video, { top: 100 });
    const adapter = createTikTokAdapter(fixture);
    const active = adapter.getActiveVideo();
    expect(active).not.toBeNull();
    if (!active) throw new Error('Missing active fixture');
    expect(adapter.extractMetadata(active)).toEqual({
      caption: 'A synthetic caption for testing.',
      thumbnailUrl: 'https://images.example/first.jpg',
      durationSeconds: 120,
    });
    video.poster = 'javascript:alert(1)';
    Object.defineProperty(video, 'duration', { value: Infinity });
    expect(adapter.extractMetadata(active)).toEqual({
      caption: 'A synthetic caption for testing.',
    });
  });
});
