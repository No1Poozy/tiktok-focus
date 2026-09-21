import type { WatchSession } from '../../domain/playback/playback-state';

/** Snapshots are validated at the persistence boundary. */
export interface SessionRepository {
  get(): Promise<WatchSession | null>;
  set(session: WatchSession): Promise<void>;
  clear(): Promise<void>;
}
