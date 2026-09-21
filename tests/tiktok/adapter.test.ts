import { describe, expect, it, vi } from 'vitest';

import { createTikTokAdapter } from '../../src/tiktok/adapter';

describe('TikTok adapter lifecycle', () => {
  it('supports identity parsing without browser globals or a document', () => {
    const adapter = createTikTokAdapter();

    expect(adapter.signal.aborted).toBe(false);
    expect(adapter.getVideoIdentity('https://www.tiktok.com/@creator/video/123')?.videoId).toBe(
      '123',
    );
    expect(adapter.getVideoIdentity('https://www.tiktok.com/foryou')).toBeNull();
    adapter.dispose();
  });

  it('aborts once on disposal and refuses operations after disposal', () => {
    const adapter = createTikTokAdapter();
    const onAbort = vi.fn();
    adapter.signal.addEventListener('abort', onAbort, { once: true });

    adapter.dispose();
    adapter.dispose();

    expect(adapter.signal.aborted).toBe(true);
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(() => adapter.getVideoIdentity('https://www.tiktok.com/@creator/video/123')).toThrow(
      'TikTok adapter has been disposed.',
    );
  });

  it('keeps separate content-script lifetimes independent', () => {
    const first = createTikTokAdapter();
    const second = createTikTokAdapter();

    first.dispose();

    expect(second.signal.aborted).toBe(false);
    expect(second.getVideoIdentity('https://www.tiktok.com/@creator/video/123')).not.toBeNull();
    second.dispose();
  });
});
