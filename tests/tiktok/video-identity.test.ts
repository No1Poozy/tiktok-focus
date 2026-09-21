import { describe, expect, it } from 'vitest';

import { parseTikTokVideoUrl } from '../../src/tiktok/video-identity';

describe('parseTikTokVideoUrl', () => {
  it('preserves a video ID larger than the safe integer range as a string', () => {
    expect(
      parseTikTokVideoUrl('https://www.tiktok.com/@creator.name_1/video/7398123456789012345'),
    ).toEqual({
      videoId: '7398123456789012345',
      canonicalUrl: 'https://www.tiktok.com/@creator.name_1/video/7398123456789012345',
      creator: 'creator.name_1',
    });
  });

  it('discards a trailing slash, tracking query, and fragment', () => {
    expect(
      parseTikTokVideoUrl('https://www.tiktok.com/@creator/video/123/?is_from_webapp=1#comments'),
    ).toEqual({
      videoId: '123',
      canonicalUrl: 'https://www.tiktok.com/@creator/video/123',
      creator: 'creator',
    });
  });

  it('normalizes origin casing while preserving creator casing and ID digits', () => {
    expect(parseTikTokVideoUrl('HTTPS://WWW.TIKTOK.COM/@Creator/video/000123')).toEqual({
      videoId: '000123',
      canonicalUrl: 'https://www.tiktok.com/@Creator/video/000123',
      creator: 'Creator',
    });
  });

  it.each([
    '',
    'not a URL',
    '/@creator/video/123',
    '//www.tiktok.com/@creator/video/123',
    'http://www.tiktok.com/@creator/video/123',
    'https://tiktok.com/@creator/video/123',
    'https://m.tiktok.com/@creator/video/123',
    'https://vm.tiktok.com/short-link',
    'https://www.tiktok.com.evil.test/@creator/video/123',
    'https://www.tiktok.com@evil.test/@creator/video/123',
    'https://evil.test@www.tiktok.com/@creator/video/123',
    'https://user:password@www.tiktok.com/@creator/video/123',
    'https://www.tiktok.com:443/@creator/video/123',
    'https://www.tiktok.com:8443/@creator/video/123',
    'https://www.tiktok.com./@creator/video/123',
    'https://www.tiktok.com/',
    'https://www.tiktok.com/foryou',
    'https://www.tiktok.com/@creator',
    'https://www.tiktok.com/@creator/photo/123',
    'https://www.tiktok.com/@creator/VIDEO/123',
    'https://www.tiktok.com/@/video/123',
    'https://www.tiktok.com/@creator/video/',
    'https://www.tiktok.com/@creator/video/12abc',
    'https://www.tiktok.com/@creator/video/-123',
    'https://www.tiktok.com/@creator/video/1.23',
    'https://www.tiktok.com/@creator/video/123/comments',
    'https://www.tiktok.com/@creator/video/123//',
    'https://www.tiktok.com/other/../@creator/video/123',
    'https://www.tiktok.com/@creator/video/other/../123',
    'https://www.tiktok.com/@creator%2Fname/video/123',
    'https://www.tiktok.com/%40creator/video/123',
    'https://www.tiktok.com/@creator/video/%31%32%33',
    'https://www.tiktok.com\\@creator\\video\\123',
    ' https://www.tiktok.com/@creator/video/123',
    'https://www.tiktok.com/@creator/video/123 ',
    'https://www.tiktok.com/@creator/video/123\n',
    'https://www.tiktok.com/@creator/video/123?tracking=x\n',
  ])('rejects unsupported or misleading URL %j', (url) => {
    expect(parseTikTokVideoUrl(url)).toBeNull();
  });
});
