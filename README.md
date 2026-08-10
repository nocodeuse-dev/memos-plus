# Memos Plus

不再堆积零散素材，收集即归档。

一键抓取内容，直接归入目标文档。收集同步完成整理，碎片化信息从此有序。

## 中文介绍

Memos Plus 是一个本地优先的 Obsidian 收集与整理工作台。它不是让你再多维护一个收集箱，而是把灵感、链接、任务、病例经验、项目想法和临时素材，在记录的同时送到正确的笔记、项目文件或 Markdown 标题下面。

- 一键收集：从主页面、快速记录弹窗、侧边栏或移动端入口抓取内容。
- 即时归档：把内容直接投递到项目文件、标签文件、最近文件或真实 Markdown 标题下。
- 边收边整理：支持链接资料、普通笔记、Obsidian Tasks 任务、Callout、代码块和自定义格式。
- Apple 同步：统一任务表单可选择 Obsidian / Tasks、Apple Reminders 或 Apple Calendar。Reminders 支持独立的截止时间、提醒时间和提前提醒；明确的开始/结束时间段可写入 Calendar。Markdown 仍是兼容底座，Apple 访问默认关闭。
- 日程与任务：日程继续来自 Apple Calendar，任务复用 Markdown 与 Apple Reminders；右侧任务可拖到日 / 周时间轴安排日期和具体时间，定时任务使用带复选框的轻量虚线标记。点击任务可在右侧原位编辑日期、时间、提醒、优先级、重复、项目、标签、备注和关联笔记；项目同时筛选统一工作台的任务列表与时间轴。快速任务输入支持无 AI 的中文日期、时间、提前提醒、标签和优先级解析，确认预览后才创建。重复任务兼容 Obsidian Tasks，并在完成后保留历史、生成下一次。桌面三栏可折叠并记住宽度，移动端使用今天、任务、日历单栏切换。
- 移动端可用：适合 iPhone 快速记录，也支持 GitHub Release / BRAT 更新方式。

完整中文产品介绍见 [飞书文档](https://d00d1uhgsxk.feishu.cn/wiki/EErRwsN1oibZ14kiBsdcTqq2nyd?from=from_copylink)。

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

Memos Plus does not use accounts, telemetry, or ads. Memo, project, template,
task, and saved-search features read or write Markdown data locally inside your
vault. When link title analysis is enabled, only URLs you choose to analyze are
requested to retrieve their page titles; note content is not uploaded by Memos
Plus.

Apple sync is opt-in and macOS-desktop-only. It uses the local Apple automation
interface and never stores an Apple ID password or CalDAV credential. Only
Markdown tasks carrying the configured sync tag are exported. Stable local and
Apple Reminder identifiers prevent duplicates and allow linked deletions to
propagate in either direction. Calendar events remain a separate agenda source.
The settings page lists the real Reminders lists, and a dedicated `Memos Plus`
list is created only after an explicit button click.

## Development

```bash
npm install
npm test
npm run build
npm run sync
```

Release artifacts are `main.js`, `manifest.json`, and `styles.css`.

`npm run sync` is the default release loop. It runs tests, lint, and build
before bumping the patch version, commits the release, pushes `main`, creates a
GitHub tag, waits for the GitHub Release workflow, installs the release into the
`Steamboy` vault from GitHub, then reloads only the `memos-plus` plugin.

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
npm run install:github -- --tag 0.1.123
```

To reinstall from GitHub as a completely fresh plugin and discard old plugin
settings:

```bash
npm run install:github -- --tag 0.1.123 --clean --discard-data
```

## Publish a Release

Before publishing, make sure the version in `package.json`, `package-lock.json`,
`manifest.json`, and `versions.json` is the same.

```bash
npm test
npm run build
npm run check:release-version -- 0.1.123
git tag 0.1.123
git push origin main 0.1.123
```

The GitHub Actions release workflow runs tests and lint, checks the release version,
builds `main.js`, and publishes the three Obsidian release assets:
`main.js`, `manifest.json`, and `styles.css`.

For normal plugin changes, prefer:

```bash
npm run sync
```

This command handles the patch version bump, GitHub release, GitHub-based
Steamboy installation, and plugin reload together.

## Credits

Memos Plus is inspired by Memoria, usememos/memos, and Obsidian Thino. It is implemented as a new TypeScript plugin project and does not copy bundled release code.
