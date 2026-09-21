/** Keep structural fallbacks independent of TikTok's generated class names. */
export const VIDEO_SELECTOR = 'video';
export const VIDEO_LINK_SELECTOR = 'a[href*="/video/"]';
export const CAPTION_SELECTOR = '[data-e2e="video-desc"], [data-e2e="browse-video-desc"]';
// Both the older detail player and the current feed-style permalink layout.
export const DETAIL_VIDEO_SELECTOR = '[data-e2e="browse-video"], [data-e2e="feed-video"]';
export const OWNED_SELECTOR = '[data-tiktok-focus-owned]';
export const CANVAS_PLAYER_SELECTOR = '[id^="xgwrapper-"]';
export const FEED_CARD_SELECTOR = 'article[data-e2e="recommend-list-item-container"]';
export const FEED_AUTHOR_SELECTOR = 'a[data-e2e="video-author-avatar"][href]';
export const PLAYER_CONTROL_SELECTOR =
  'button, [role="button"], [data-e2e*="more"], [data-e2e*="volume"], [aria-haspopup]';
export const PLAYER_MORE_SELECTOR = '[data-e2e="more-menu-icon"]';
export const BROWSE_VIDEO_SELECTOR = '[data-e2e="browse-video"]';
export const BROWSE_MENU_SELECTOR = '[data-e2e="browse-ellipsis"]';
export const BROWSE_CLOSE_SELECTOR = '[data-e2e="browse-close"]';
