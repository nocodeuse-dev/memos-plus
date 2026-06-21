# Memos Plus

不再堆积零散素材，收集即归档。

一键抓取内容，直接归入目标文档。收集同步完成整理，碎片化信息从此有序。

## 中文介绍

Memos Plus 是一个本地优先的 Obsidian 收集与整理工作台。它不是让你再多维护一个收集箱，而是把灵感、链接、任务、病例经验、项目想法和临时素材，在记录的同时送到正确的笔记、项目文件或 Markdown 标题下面。

- 一键收集：从主页面、快速记录弹窗、侧边栏或移动端入口抓取内容。
- 即时归档：把内容直接投递到项目文件、标签文件、最近文件或真实 Markdown 标题下。
- 边收边整理：支持链接资料、普通笔记、Obsidian Tasks 任务、Callout、代码块和自定义格式。
- 移动端可用：适合 iPhone 快速记录，也支持 GitHub Release / BRAT 更新方式。

完整中文产品介绍见 [docs/FEISHU_INTRO.md](docs/FEISHU_INTRO.md)。

## English Summary

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

`npm run sync` is the default release loop. It bumps the patch version, runs
tests and build, commits the release, pushes `main`, creates a GitHub tag, waits
for the GitHub Release workflow, installs the release into the `Steamboy` vault
from GitHub, then reloads only the `memos-plus` plugin.

For emergency local-only testing, `npm run sync:local` keeps the old direct
build-and-copy behavior.

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

To reinstall from GitHub as a completely fresh plugin and discard old plugin
settings:

```bash
npm run install:github -- --tag v0.1.123 --clean --discard-data
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

For normal plugin changes, prefer:

```bash
npm run sync
```

This command handles the patch version bump, GitHub release, GitHub-based
Steamboy installation, and plugin reload together.

## Credits

Memos Plus is inspired by Memoria, usememos/memos, and Obsidian Thino. It is implemented as a new TypeScript plugin project and does not copy bundled release code.
