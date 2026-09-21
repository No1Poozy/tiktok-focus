import type { WatchSession } from '../domain/playback/playback-state';

/** Future use case for deciding when a saved viewing session may be restored. */
export interface SessionService {
  remember(session: WatchSession): Promise<void>;
  getRestorableSession(): Promise<WatchSession | null>;
  forget(): Promise<void>;
}
