# Memos Plus

Memos Plus is a local-first Obsidian plugin for quick memo capture, review, filtering, and lightweight task tracking. It stores memos in readable yearly Markdown files.

## Storage format

By default, Memos Plus writes yearly files under `我的资源/Memos`, such as `我的资源/Memos/2026.md`. You can change the memo folder in the plugin settings.

```markdown
# 2026
## 2026-06
### 2026-06-12 周五
- 2026-06-12 06:03
  这是一条 memo #灵感
  第二行内容继续写在这里
  - [ ] 支持待办
```

## Features

- Quick capture view and command.
- Timeline cards with Markdown rendering.
- Search, tag filtering, and status views.
- Today, week, todo, pinned, starred, and archived views.
- Calendar-style activity overview.
- Random review and on-this-day review.
- Inline task checkbox updates.
- Configurable yearly Markdown memo folder.

## Privacy and security

Memos Plus does not use accounts, telemetry, ads, or network requests. It only reads and writes yearly Markdown files in the folder configured in settings, plus attachments saved through the plugin.

## Development

```bash
npm install
npm test
npm run build
npm run sync
```

Release artifacts are `main.js`, `manifest.json`, and `styles.css`.

`npm run sync` is the default local development loop. It bumps the patch
version, builds the plugin, copies `main.js`, `manifest.json`, and `styles.css`
to `/Users/yangjiahao/Documents/Steamboy/.obsidian/plugins/memos-plus`, then
asks the Obsidian CLI to reload only the `memos-plus` plugin in the `Steamboy`
vault.

## Install from GitHub

The source repository is published at:

```text
https://github.com/nocodeuse-dev/memos-plus
```

Memos Plus is distributed through GitHub Releases. Each release attaches:

- `main.js`
- `manifest.json`
- `styles.css`
- `memos-plus-<version>.zip`

For Steamboy, BRAT should track this repository as a latest-version beta plugin:

```text
nocodeuse-dev/memos-plus
```

The local one-command GitHub install path downloads the latest release assets,
copies them into Steamboy, ensures the plugin is enabled, and reloads only
`memos-plus`:

```bash
npm run install:github
```

To install a specific release tag instead:

```bash
npm run install:github -- --tag v0.1.123
```

## Publish a Release

Before publishing, make sure the version in `package.json`, `package-lock.json`,
`manifest.json`, and `versions.json` is the same.

```bash
npm test
npm run build
npm run check:release-version -- v0.1.123
git tag v0.1.123
git push origin main v0.1.123
```

The GitHub Actions release workflow runs tests, checks the release version,
builds `main.js`, packages the release zip, and publishes the four release
assets for BRAT and manual installation.

## Credits

Memos Plus is inspired by Memoria, usememos/memos, and Obsidian Thino. It is implemented as a new TypeScript plugin project and does not copy bundled release code.
