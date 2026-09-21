import { describe, expect, it, vi } from 'vitest';
import { createPlaybackControls } from '../../src/tiktok/playback-controls';
import { mediaFixture } from '../ui/media-fixture';

// Positioning has its own browser-geometry tests; these cover fullscreen ownership.
vi.mock('../../src/tiktok/video-controls-anchor', () => ({
  createVideoControlsAnchor: () => ({ update: vi.fn(), dispose: vi.fn() }),
}));

describe('custom fullscreen lifecycle', () => {
  it.each(['exit', 'rejected', 'dispose', 'recycled', 'removed'])(
    'restores the original player after %s',
    async (outcome) => {
      const fixture = mediaFixture();
      const { document, window, video, root, requestFullscreen, exitFullscreen } = fixture;
      const beforeStyle = video.getAttribute('style');
      const controls = createPlaybackControls(document);
      controls.update({ element: video, identity: null });
      const toolbar = document.querySelector('[data-tiktok-focus-owned]');
      const button = toolbar?.shadowRoot?.querySelector('button');
      if (!button) throw new Error('Missing entry button');
      if (outcome === 'rejected') requestFullscreen.mockRejectedValueOnce(new Error('Denied'));
      button.dispatchEvent(new window.Event('click'));
      expect(requestFullscreen).toHaveBeenCalledOnce();
      expect(root.querySelector('[data-tiktok-fullscreen-overlay]')).not.toBeNull();
      expect(video.parentElement).toBe(root);
      expect(video.controls).toBe(false);
      await Promise.resolve();
      await Promise.resolve();
      if (outcome === 'exit') fixture.setFullscreen(null);
      if (outcome === 'dispose') controls.dispose();
      if (outcome === 'recycled')
        controls.update({
          element: video,
          identity: {
            videoId: '456',
            creator: 'next',
            canonicalUrl: 'https://www.tiktok.com/@next/video/456',
          },
        });
      if (outcome === 'removed') {
        video.remove();
        controls.update(null);
      }
      expect(root.hasAttribute('data-tiktok-fullscreen-root')).toBe(false);
      expect(root.querySelector('[data-tiktok-fullscreen-overlay]')).toBeNull();
      expect(video.hasAttribute('data-tiktok-fullscreen-video')).toBe(false);
      expect(video.controls).toBe(true);
      expect(video.getAttribute('style')).toBe(beforeStyle);
      expect(document.querySelector('style[data-tiktok-focus-owned]')).toBeNull();
      if (outcome === 'dispose' || outcome === 'recycled' || outcome === 'removed')
        expect(exitFullscreen).toHaveBeenCalledOnce();
      controls.dispose();
    },
  );
  it('cleans up a request that succeeds after disposal', async () => {
    const fixture = mediaFixture();
    let resolve: () => void = () => {};
    fixture.requestFullscreen.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const controls = createPlaybackControls(fixture.document);
    controls.update({ element: fixture.video, identity: null });
    fixture.document
      .querySelector('[data-tiktok-focus-owned]')
      ?.shadowRoot?.querySelector('button')
      ?.dispatchEvent(new fixture.window.Event('click'));
    controls.dispose();
    fixture.setFullscreen(fixture.root);
    resolve();
    await Promise.resolve();
    expect(fixture.exitFullscreen).toHaveBeenCalledOnce();
    expect(fixture.document.fullscreenElement).toBeNull();
    expect(fixture.video.controls).toBe(true);
    expect(fixture.document.querySelector('[data-tiktok-fullscreen-overlay]')).toBeNull();
  });
  it('keeps errors visible in fullscreen and clears them after recovery', () => {
    const fixture = mediaFixture();
    const controls = createPlaybackControls(fixture.document);
    controls.update({ element: fixture.video, identity: null });
    controls.showError('Could not save watch progress.');
    const toolbar = fixture.document.querySelector('[data-tiktok-focus-owned]');
    toolbar?.shadowRoot?.querySelector('button')?.dispatchEvent(new fixture.window.Event('click'));
    const saved = fixture.root
      .querySelector('[data-tiktok-fullscreen-overlay]')
      ?.shadowRoot?.querySelector('.saved');
    expect(saved?.textContent).toBe('Could not save watch progress.');
    expect(saved?.hasAttribute('data-error')).toBe(true);
    controls.showStatus('');
    expect(saved?.textContent).toBe('');
    expect(saved?.hasAttribute('data-error')).toBe(false);
    expect(toolbar?.shadowRoot?.querySelector('.status')?.textContent).toBe('');
    controls.dispose();
  });
  it('does not forward a fullscreen button click to the native player', () => {
    const fixture = mediaFixture();
    const controls = createPlaybackControls(fixture.document);
    controls.update({ element: fixture.video, identity: null });
    const toolbar = fixture.document.querySelector('[data-tiktok-playback-controls]');
    if (!toolbar) throw new Error('Missing toolbar');
    fixture.root.append(toolbar);
    const nativeClick = vi.fn();
    fixture.root.addEventListener('click', nativeClick);
    toolbar.dispatchEvent(new fixture.window.Event('click', { bubbles: true }));
    expect(nativeClick).not.toHaveBeenCalled();
    controls.dispose();
  });
});
