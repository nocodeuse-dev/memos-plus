# Memos Plus

Memos Plus is a local-first Obsidian plugin for quick memo capture, review, filtering, and lightweight task tracking. It stores memos in readable yearly Markdown files.

## 中文介绍

Memos Plus 是一个本地优先的 Obsidian 插件，适合用来快速记录灵感、链接、任务、病例经验和项目笔记，再把这些内容整理到年度 memo 文件、项目文件或指定标题下面。

- 快速记录：支持主页面输入、快速记录弹窗和侧边栏输入。
- 整理投递：支持把内容发送到项目文件、标签文件或真实 Markdown 标题下。
- 任务兼容：支持 Obsidian Tasks 风格任务、优先级和日期字段。
- 移动端可用：支持移动端轻量首页和 GitHub Release / BRAT 更新方式。

如果你想先看完整的中文产品介绍，可以直接看 [docs/FEISHU_INTRO.md](/Users/yangjiahao/Documents/Obsidian-memos/docs/FEISHU_INTRO.md)。

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
