# TikTok Focus

TikTok Focus is a Chrome Manifest V3 extension that adds a custom fullscreen player to TikTok, with optional local watch history and playback resume.

## Why did I stop developing it?

I originally built this because I wanted a better fullscreen experience for TikTok on PC. While working on it, TikTok introduced its own fullscreen feature, so the main reason I started the project disappeared. I decided to stop active development and open-source it instead.

The extension passed its tests and production build during the final release review, but TikTok can change its site independently and may eventually break the integration.

## Features

- A fullscreen button for supported TikTok video layouts.
- A custom fullscreen player with play/pause, seeking, 10-second skip controls, volume, playback speed from 0.5× to 2×, and controls that hide while a video is playing.
- Fullscreen keyboard controls:
  - `Space` or `K`: play or pause
  - `Left Arrow` / `Right Arrow`: seek five seconds
  - `J` / `L`: seek ten seconds
  - `M`: mute or unmute
  - `F` or `Escape`: leave fullscreen
- Opt-in watch history that records recognized TikTok videos and playback progress.
- Optional playback resume for unfinished videos. Watch history must also be enabled for resume to work.
- A local history page for opening entries, reviewing progress, removing individual entries, loading older entries, or clearing all history.
- Configurable automatic history retention from 1 to 365 days.
- A popup link for reopening the last watched video when a saved session is available.

Watch history and playback resume are disabled by default.

## Privacy and security

- Watch history, playback progress, settings, and the current watch session are stored locally in the browser.
- The extension has no backend service.
- It contains no analytics or telemetry.
- The application makes no network requests to send user data elsewhere. TikTok itself continues to make its normal site requests.
- The generated Chrome manifest requests only the `storage` permission. Its content script runs only on `https://www.tiktok.com/*`.
- The production package contains no remotely loaded executable code.

As part of the final release review, the source, generated manifest, and production package were checked for realistic extension-security and privacy issues. The build completed successfully, all 297 automated tests passed, and no secrets or browser-profile data were found in the generated package. This review is not a guarantee that the extension is free of defects or future incompatibilities.

If you have security or privacy concerns, review the source code and generated manifest before installing the extension.

## Install as an unpacked extension

There is no Chrome Web Store installation. Build the extension locally and load the generated directory into Chrome.

Requirements:

- Node.js 24
- Corepack and pnpm 12.4.2 (the pnpm version is pinned in `package.json`)

```sh
corepack enable
pnpm install
pnpm build
```

Then:

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the generated `.output/chrome-mv3` directory.
5. Reload any open TikTok tabs after installing or updating the extension.

On Windows systems where PowerShell blocks command shims, use `corepack.cmd` and `pnpm.cmd` instead.

## Development

```sh
pnpm install
pnpm dev
```

Available checks and build commands:

| Command             | Purpose                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| `pnpm check`        | Run type checking, linting, formatting validation, and tests                   |
| `pnpm test`         | Run the Vitest test suite once                                                 |
| `pnpm test:watch`   | Run tests in watch mode                                                        |
| `pnpm typecheck`    | Generate WXT types and run strict TypeScript checks                            |
| `pnpm lint`         | Run ESLint with zero warnings allowed                                          |
| `pnpm format:check` | Check formatting with Prettier                                                 |
| `pnpm build`        | Create the production Chrome MV3 build and verify its manifest and entrypoints |

The project uses WXT, strict TypeScript, vanilla HTML/CSS, Vitest, ESLint, and Prettier. Runtime extension code does not use a UI framework.

Additional notes are available in [the architecture documentation](docs/architecture.md), [the TikTok integration documentation](docs/tiktok-integration.md), and [the development guide](docs/development.md).

## Scope and limitations

- The extension depends on TikTok's page structure and selectors, which can change without notice.
- History entries are created only when the extension can identify a supported video and its canonical TikTok URL.
- Live streams, photo posts, share-link resolution, history search/export, and cloud sync are not implemented.
- An abrupt browser shutdown can lose the most recent few seconds of playback progress because progress writes are throttled.

## Contributing and forks

There is no active roadmap, and issues or pull requests may not receive a response. You are still welcome to study the implementation or propose focused fixes. If you want to continue development, a maintained fork is likely the best path once the repository has an explicit open-source license.

Please keep changes small, preserve local-only data handling, avoid telemetry and remote executable code, and keep Chrome permissions minimal.

## License

No open-source license has been selected yet. Until a `LICENSE` file is added, the code remains under default copyright and should not be treated as granting permission to copy, redistribute, or publish modified versions.

Choose and add an appropriate open-source license before publishing this repository as an open-source project.
