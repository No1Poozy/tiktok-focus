# Architecture

## Boundaries

- **Domain** owns immutable models and pure validation, playback, completion, resume, and retention rules. No DOM, Chrome, WXT, or TikTok imports.
- **Application** coordinates consent, progress, resume, retention, and remembered sessions through HistoryService. Repository ports keep persistence replaceable. Small playback/session interfaces reserve boundaries for future independent coordinators.
- **TikTok** owns selectors, identity, active-video/metadata detection, SPA observation, fullscreen presentation, and the media controller. It receives persistence/settings functions from entrypoints and does not call Chrome APIs.
- **Infrastructure** implements storage, native IndexedDB, typed messaging, and browser bindings. The background synchronously registers listeners on each worker start.
- **UI** handles extension-owned DOM through injected actions/ports. **Entrypoints** compose modules. **Shared** holds small generic constants.

Custom fullscreen has three owners: tiktok/playback-controls.ts manages its entry button and progress status; tiktok/fullscreen-session.ts manages the Fullscreen API and reversible site DOM changes; ui/components/fullscreen-player.ts manages generic media controls with a separate shadow-root stylesheet. The existing media controller remains the only source of progress writes. UI changes should not require editing persistence or detection code.

Imports point inward: infrastructure implements application ports; application depends on domain; domain is platform independent. ESLint enforces core boundaries.

## Persistence

Settings and remembered sessions use separate chrome.storage.local records shaped as `{ schemaVersion, data }`, starting at CURRENT_SCHEMA_VERSION = 1. Reads validate unknown values and return fresh objects. Missing/malformed settings use defaults without writes. Unsupported numeric versions throw and are preserved. storage/migrations.ts owns the seam for explicit pure migrations.

Settings created before Focus Mode was removed remain readable: the retired field is ignored, and the history, resume, and retention preferences are preserved. Subsequent settings writes store only the current fields. History and remembered-session storage identities are unchanged.

History uses native IndexedDB in the extension background context, never TikTok's origin. A compound last-watched/video-ID index gives stable pagination. Reads/writes validate payloads; transactions protect unsupported record versions from replacement/deletion. No IndexedDB wrapper or database types enter application/domain.

The service serializes history mutations across tabs. Bounded persisted viewing-session tokens prevent periodic writes from inflating watch counts across worker restarts. The queue is coordination, never durable state. Writes finish before acknowledgement. Progress is throttled to five seconds with lifecycle flushes. Retention runs on first use, hourly while active, or after policy changes, without an alarms permission. Simultaneous edits in separate settings pages retain local-storage last-write-wins semantics.

## Structure choices

application/ports makes dependency direction explicit; ui/pages keeps entrypoints thin. No generic repository, event bus, state manager, DI container, UI framework, or unused generic Result helper is introduced.

WXT reserves the history name for overriding Chrome's history page. Our entrypoints:found hook makes it an unlisted extension page. The production verifier rejects chrome_url_overrides, broad permissions, and missing entrypoint output.
