# TikTok fixture strategy

`feed.html` exercises nearest-card permalinks, caption extraction, conflicting
links, recycled players, and neighbouring offscreen preloads. `detail.html`
exercises the `browse-video` detail marker and independent recommendation identity.
`modern-detail.html` recreates the feed-video/section layout seen during anonymous public permalink inspection, with synthetic identifiers and all unrelated content removed.
`canvas-detail.html` covers the transparent media element and visible canvas inside a single xgwrapper player observed on a public direct video link. Tests also reject hidden/offscreen canvases, unrelated canvases, and multi-video wrappers.
`modern-feed.html` reproduces public For You cards without video permalinks. Synthetic xgwrapper IDs and marked author-avatar links exercise per-card identity, metadata, and rejection of missing or ambiguous evidence.
`browse-toolbar.html` represents classic Browser Mode's separate `browse-close`, `browse-ellipsis`, `browse-video`, and `browse-sound` controls. These markers and absolute toolbar placement were verified in TikTok's public Browser Mode component code; this is a sanitized structural fixture, not a captured live DOM. Its player panel can be wider/taller than the media, unlike the feed's `more-menu-icon` row.
All fixtures are minimal markup, not complete captured TikTok pages.
Tests provide deterministic geometry and media state, and use linkedom for native
selector and mutation semantics. They do not claim to emulate browser layout.

- Keep only the smallest HTML fragment needed to reproduce a selector or behavior.
- Replace handles, captions, IDs, media URLs, and other user data with synthetic values.
- Remove scripts, tracking attributes, tokens, cookies, and unrelated markup.
- Record which detector and layout variant the fixture exercises.
- Cover missing elements and conflicting candidates as well as a successful match.

Never commit complete captured TikTok pages. Tests should run offline and must not
depend on a live TikTok account, network request, or real user's content.
