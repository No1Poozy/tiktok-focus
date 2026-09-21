# TikTok integration

TikTok changes independently of this extension. Site-specific selectors, attributes, DOM interpretation, observers, URL parsing, and fullscreen styles live in src/tiktok.

## Detection

Observation starts lazily on subscription. The adapter maintains an incremental video set and ranks visible candidates by viewport coverage, center proximity, and playback state. Hidden/offscreen/preloaded and extension-owned elements are excluded. Mutation, intersection, media, scroll, and resize events schedule at most one update per animation frame. There is no polling or whole-document video rescan per mutation.

Canvas-backed players can keep their media element at zero opacity. In a recognized xgwrapper container with exactly one video and one visible canvas, selection uses the canvas geometry while progress events still come from the original video. Unrelated canvases, ambiguous players, and offscreen surfaces remain excluded.

Identity comes from an unambiguous nearby permalink within a single-video subtree. Detail URL fallback requires a recognized browse-video or feed-video player and a canonical video route. A matching xgwrapper video ID allows fallback even with additional preloaded players; a conflicting wrapper ID blocks fallback. Layouts without a wrapper ID still require a single detail player. Unknown identity stays null: Fullscreen can work, but history will not guess. The parser accepts canonical HTTPS www.tiktok.com video paths, keeps string IDs, and rejects misleading hosts, credentials, explicit ports, and encoded/non-video paths.

Modern For You cards may have no video permalink. Within a recognized single-video article, the adapter combines the xgwrapper video ID with the marked author-avatar profile link, then validates the resulting canonical URL. Missing or conflicting authors, unrelated profile mentions, multiple videos, and contradictory permalinks cannot supply a fallback identity. The fallback never searches neighbouring cards or page-wide profile links.

Navigation uses the Navigation API where available, popstate/hashchange, and URL checks during DOM/media updates. No page-history monkeypatch is used. Notifications are deduplicated; the last unsubscribe/disposal disconnects observers/listeners and cancels queued frames.

## Presentation and media

Classic Browser Mode is handled separately by browse-controls.ts. Its `browse-ellipsis` is an absolutely positioned div beside `browse-close`, outside the narrower `browse-video` surface; it is not the feed's `more-menu-icon`. A bounded ancestor search requires the recognized video, exactly one menu, a close control, and one video within a positioned player panel. Only the owned button is appended to that panel, placed 8px beside the menu with matching size, color, and background. Coordinates account for borders, scrolling, and CSS scaling. Hover uses the whole player panel, including its header and letterbox area. The markers and positioning were verified in TikTok's public Browser Mode component source; browser fixtures cover this layout separately from live feed checks.

playback-controls.ts owns the entry button and tracking warnings. video-controls-anchor.ts places it beside the native menu: native-controls-dock.ts validates a top-right `more-menu-icon` and its nearby horizontal flex row, without depending on generated class names. The owned shadow host joins that row before the menu, taking its control height and spacing. This preserves native ancestor hover while the pointer is over fullscreen. Activation events stop at the host so they cannot toggle the underlying video; hover events propagate normally. Removed/replaced rows are detected and the host is remounted or falls back to a standalone position. No native nodes are moved or styled.

Docking requires the menu branch to participate in normal layout; absolute/fixed menu branches use standalone collision avoidance. The owned entry supplies any missing spacing up to 8px. After insertion, measured rectangles must remain on the same row, retain the minimum hit area, and have at least 8px clearance. Fixed-width or wrapping rows that fail this check fall back without modifying native styles. Mutations containing only extension-owned nodes are ignored so an unsuccessful insertion cannot trigger a remount loop.

For unknown layouts, the standalone icon is positioned inside the video's top-right corner, shifting left around nearby native controls. Both modes use the same presentation surface as active-video detection, including transparent media with a visible canvas. Geometry runs on coalesced scroll, resize, local child-list mutations, media state, and fullscreen events; pointer movement checks cached bounds. Observers and pending animation frames are cleaned up on replacement/disposal. The docked button is revealed on video hover or keyboard focus and hides when the pointer leaves, including while paused. Touch layouts keep the button accessible without hover. The standalone fallback also stays visible while paused. Both hide while another element is fullscreen or the video's top edge is outside the viewport.

fullscreen-session.ts requests browser fullscreen on the original video's single-video parent, mounts the custom overlay, and restores markers, styles, and native-controls state on exit. The original video is never cloned or reparented. Fullscreen is requested synchronously in the click task to preserve user activation. A rejected request, disposal during a pending request, a removed video, or a recycled video identity all clean up the session.

The docked button takes the native menu's text color and uses the existing video-hover flag or keyboard focus for visibility. Hover adds a subtle circular background and a small icon scale, with a press response; reduced-motion preferences disable the scale and transitions. These effects do not animate opacity or change the hit area. It does not copy the menu's opacity, run an independent fade, or add a shadow. Native opacity snapshots can become stale after CSS-only state changes, so they must not control whether fullscreen remains accessible.

The fullscreen-only stylesheet reveals the original media element, which canvas-backed players otherwise keep transparent, and hides sibling presentation layers inside the fullscreen parent. It never overwrites TikTok's inline styles. Media events continue through the existing controller and persistence pipeline.

The generic UI lives in ui/components/fullscreen-player.ts with scoped styles in ui/styles/fullscreen-player.css. It receives a media element and an exit callback, with no TikTok selectors or storage access. Seeking previews locally while dragging and commits on change; pause/play, rate, volume, buffering, and time displays follow media events. A single resettable timeout hides controls while playing; there is no playback polling. AbortController and timeout cleanup cover every UI listener. Keyboard handling is scoped to the mounted session; native range/select interaction and Escape remain available.

controller.ts connects media events to injected ports. Recording requires consent and verified identity. Hot writes are limited to five seconds with lifecycle flushes. Recycled-video identity is rechecked before attribution. Resume waits for metadata, avoids completed/near-end positions, respects manual seeking, and cancels stale requests after disposal or disabling resume. Infrastructure forwards settings changes to open TikTok tabs.

Late events from a recycled player retain the previous verified sample for flushing. Resume eligibility is checked when attaching to the player, so autoplay during a slow storage lookup does not cancel restoration or overwrite the saved position. A failed seek retains its target for a subsequent media event.

Completed seeks flush the final position immediately, including scrubbing while paused. They retain the same consent and video identity checks as normal playback and do not wait for the five-second playback throttle.

Progress is saved silently, without tracking or saved-position notifications. The toolbar reports when history is disabled, a video cannot be identified, or persistence fails; a successful save clears a previous error after the background acknowledges persistence. A visible Fullscreen button by itself does not imply progress is being saved.

## Validation

Synthetic feed/detail fixtures cover conflicting links, preloads, recycled players, metadata, SPA changes, and teardown. Chrome smoke tests cover messaging/IndexedDB, fullscreen cleanup, and deterministic media events. Public anonymous Explore markup was also inspected. These checks do not guarantee every live layout.

A public canvas-backed permalink was checked in a fresh Chrome profile: seeking the real media to 600 seconds persisted that position, and reloading the page restored 600 seconds. Offline fixtures cover canvas detection without depending on the live page.

Never commit complete captured pages, cookies, tokens, accounts, or personalized feeds. Add the smallest sanitized fixture for each new layout, including missing/ambiguous states.
