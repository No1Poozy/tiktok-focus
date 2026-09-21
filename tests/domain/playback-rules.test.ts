import { describe, expect, it } from 'vitest';
import {
  clampPlaybackPosition,
  getPlaybackProgressPercent,
  getResumablePosition,
  isPlaybackCompleted,
} from '../../src/domain/playback/playback-rules';

describe('playback positions', () => {
  it('clamps positions to known media bounds', () => {
    expect(clampPlaybackPosition(-10, 60)).toBe(0);
    expect(clampPlaybackPosition(75, 60)).toBe(60);
    expect(clampPlaybackPosition(12.5, 60)).toBe(12.5);
    expect(clampPlaybackPosition(12.5, 0)).toBe(0);
  });

  it('preserves a valid position when duration is unknown', () => {
    expect(clampPlaybackPosition(12.5, null)).toBe(12.5);
    expect(clampPlaybackPosition(12.5, Infinity)).toBe(12.5);
    expect(clampPlaybackPosition(12.5, NaN)).toBe(12.5);
  });

  it.each([NaN, Infinity, -Infinity])('normalizes nonfinite positions %s', (position) => {
    expect(clampPlaybackPosition(position, 60)).toBe(0);
  });
});

describe('resume policy', () => {
  it('marks at least 95 percent watched as complete', () => {
    expect(isPlaybackCompleted(94, 100)).toBe(false);
    expect(isPlaybackCompleted(95, 100)).toBe(true);
    expect(isPlaybackCompleted(100, null)).toBe(false);
  });
  it('resumes meaningful positions and avoids completed or near-end jumps', () => {
    expect(getResumablePosition(12, 60, false)).toBe(12);
    expect(getResumablePosition(12, null, false)).toBe(12);
    expect(getResumablePosition(2, 60, false)).toBeNull();
    expect(getResumablePosition(12, 60, true)).toBeNull();
    expect(getResumablePosition(18, 20, false)).toBeNull();
    expect(getResumablePosition(99, 100, false)).toBeNull();
    expect(getResumablePosition(NaN, 100, false)).toBeNull();
  });
});

describe('playback progress', () => {
  it('returns a bounded percentage', () => {
    expect(getPlaybackProgressPercent(15, 60)).toBe(25);
    expect(getPlaybackProgressPercent(-10, 60)).toBe(0);
    expect(getPlaybackProgressPercent(100, 60)).toBe(100);
  });

  it.each([null, 0, -1, Infinity, NaN])(
    'keeps unknown duration %s distinct from zero progress',
    (duration) => {
      expect(getPlaybackProgressPercent(10, duration)).toBeNull();
    },
  );
});
