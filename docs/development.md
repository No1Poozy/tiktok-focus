# Development

Use Node.js 24 and pinned pnpm. Run pnpm install on a fresh checkout; postinstall generates .wxt types. Commit pnpm-lock.yaml. Generated .wxt/.output, node_modules, caches, and .tmp are ignored. PowerShell users can use pnpm.cmd.

## Workflow

1. Review the boundaries in [Architecture](architecture.md) and identify the owning layer.
2. Run pnpm dev. Keep development output separate from production: development builds include HMR behavior.
3. Add meaningful tests for domain rules, schema/trust boundaries, media lifecycle, and relevant UI behavior.
4. Run pnpm format, pnpm check, and pnpm build. The build also checks MV3 metadata, permissions, host matching, and emitted files.
5. Reload the production extension and TikTok tabs; perform relevant browser checks.

## Browser smoke checks

- Load .output/chrome-mv3. Open popup, verify switches and background-ready status.
- Open History/Settings. Change retention, reload, and verify persistence and invalid-input rejection.
- Hover the active feed/detail video: confirm fullscreen joins the top-right menu row where recognized. Move directly between fullscreen, the menu, and volume: native controls must stay visible, and clicking fullscreen must not toggle playback or open the menu. Leave the video: fullscreen must become invisible and stop intercepting the pointer, even while paused. Re-enter and verify it reappears; repeat the cycle and check keyboard focus reveals it outside hover. Visibility must not depend on the menu's sampled opacity. Test a replaced native row, scrolling to another video, and resizing. Check standalone fallback placement/hover and transparent-video/canvas layouts too.
- Check detail players with absolute/fixed menus inside flex wrappers, narrow wrapping rows, and normal rows without a gap. Fullscreen and the native menu must remain separate with at least 8px clearance before and after resize or fullscreen exit; a failed dock must not cause repeated mount/unmount work.
- Test classic Browser Mode separately: `browse-ellipsis` plus `browse-close` around `browse-video`, with a player panel larger than the media surface. Fullscreen belongs beside that menu in the panel's header, shares its color/background, remains accessible from the header and letterbox area, and hides outside the panel. Test panel resize/scaling and fullscreen entry/exit. A feed-only `more-menu-icon` fixture is insufficient for this layout.
- Reload TikTok. Open custom fullscreen on a regular and a canvas-backed video. Check slider drag/preview, play/pause, ±10-second skips, volume, speed, Space/K, arrows, J/L, M, Tab/Shift+Tab, and Escape. Check auto-hide during playback and visibility while paused or navigating controls by keyboard. Repeat at a narrow viewport.
- Exit and reopen fullscreen; confirm the original media node, inline styles, and native-controls preference remain intact. TikTok can update its own inline styles during a resize, so compare extension markers and the restored page layout rather than assuming the site's entire style string is immutable. Test a rejected fullscreen request, tab teardown during entry, and video replacement during fullscreen.
- Enable Watch History and Resume Playback, play an unfinished video for five seconds, pause, refresh History, then reopen it and verify resume.
- Disable recording and verify later playback adds no rows. Confirm removal/clearing and remembered-session cleanup.
- Switch videos quickly, manually seek while resume is pending, navigate within TikTok, and test light/dark and keyboard focus.
- Stop the service worker in DevTools, reopen popup, and confirm saved history remains accessible.

Synthetic fixtures do not prove every TikTok layout works. Unknown/ambiguous identities are skipped, not attributed to another video.

## Dependencies

WXT/Vite package the extension. TypeScript/Node types enforce strict compilation. ESLint/typescript-eslint lint code; eslint-config-prettier avoids formatter conflicts. Prettier formats; Vitest runs tests. Linkedom supplies fixture DOM semantics; fake-indexeddb tests repository transactions. Both are test-only, not shipped database/DOM wrappers.

TypeScript 6.0.3 stays within typescript-eslint 8.70.0's supported range (below 6.1.0). Upgrade compatible peer versions together and rerun validation; see [compatibility](https://typescript-eslint.io/users/dependency-versions/) and [WXT entrypoints](https://wxt.dev/guide/essentials/entrypoints).

Permission changes, schema changes, hot paths, and runtime dependencies require concrete feature justification. Keep schema migrations backward-compatible. No telemetry or remote executable code.
