import type { PlaybackState } from '../domain/playback/playback-state';

/** Future coordinator for progress capture/resume through a media integration port. */
export interface PlaybackService {
  captureProgress(state: PlaybackState): Promise<void>;
  getResumePosition(videoId: string): Promise<number | null>;
}
