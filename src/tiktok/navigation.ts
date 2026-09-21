import type { StopTikTokObservation, TikTokVideoIdentity } from './types';

export interface TikTokNavigation {
  readonly url: string;
  readonly videoIdentity: TikTokVideoIdentity | null;
}

/** URL changes are observed without replacing page-owned history methods. */
export interface TikTokNavigationCapability {
  /** Implementation must stop observation when its owning adapter is disposed. */
  observeNavigation(listener: (navigation: TikTokNavigation) => void): StopTikTokObservation;
}
