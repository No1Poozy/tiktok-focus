import { describe, expect, it } from 'vitest';
import {
  isHistoryRequest,
  isHistoryResponse,
  MESSAGE_TYPES,
} from '../../src/infrastructure/messaging/messages';

const input = {
  videoId: '123',
  canonicalUrl: 'https://www.tiktok.com/@fixture/video/123',
  progressSeconds: 12,
  durationSeconds: 60,
  watchedAt: 1_780_000_000_000,
  watchSessionId: 'fixture-session',
};

describe('history message trust boundary', () => {
  it('accepts a canonical progress snapshot', () => {
    expect(isHistoryRequest({ type: MESSAGE_TYPES.recordProgress, input })).toBe(true);
  });
  it.each([
    { ...input, canonicalUrl: 'https://evil.example/@fixture/video/123' },
    { ...input, canonicalUrl: 'https://www.tiktok.com/@fixture/video/456' },
    { ...input, canonicalUrl: `${input.canonicalUrl}?tracking=1` },
    { ...input, progressSeconds: Infinity },
    { ...input, progressSeconds: -1 },
    { ...input, watchSessionId: '' },
  ])('rejects malformed or mismatched progress: %j', (value) => {
    expect(isHistoryRequest({ type: MESSAGE_TYPES.recordProgress, input: value })).toBe(false);
  });
  it('accepts bounded pagination with a tie-breaking ID', () => {
    expect(
      isHistoryRequest({
        type: MESSAGE_TYPES.listHistory,
        query: { limit: 100, before: 42, beforeVideoId: '123' },
      }),
    ).toBe(true);
  });
  it.each([
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { limit: 100, before: NaN },
    { limit: 10, beforeVideoId: '123' },
  ])('rejects unbounded/invalid queries: %j', (query) => {
    expect(isHistoryRequest({ type: MESSAGE_TYPES.listHistory, query })).toBe(false);
  });
  it.each([
    null,
    {},
    { type: 'unknown' },
    { type: MESSAGE_TYPES.removeHistory, videoId: '<script>' },
  ])('ignores invalid requests: %j', (request) => {
    expect(isHistoryRequest(request)).toBe(false);
  });
  it('validates both response variants without trusting payloads', () => {
    expect(isHistoryResponse({ ok: true, value: null })).toBe(true);
    expect(isHistoryResponse({ ok: false, error: 'Failed' })).toBe(true);
    expect(isHistoryResponse({ ok: true })).toBe(false);
    expect(isHistoryResponse({ ok: false, error: {} })).toBe(false);
  });
});
