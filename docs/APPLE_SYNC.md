# Apple 提醒事项与日程

Memos Plus 在 macOS Obsidian 桌面端把两类数据明确分开：Markdown 任务与 Apple Reminders 双向同步，日程工作台继续读取和创建 Apple Calendar 事件。实现使用本机 `/usr/bin/osascript` 运行 JXA，直接调用系统应用；不连接第三方服务器，也不保存 Apple ID、CalDAV 地址或应用专用密码。

桌面子进程模块只在确认运行于 macOS Obsidian Desktop 后通过 CommonJS 加载；生产构建会拒绝可能被 `app://` 页面当作网络模块请求的动态 Node 导入。移动端不会加载该模块。

## 启用前准备

1. 在 Apple 提醒事项中先创建一个独立的、可写的 `Memos Plus` 列表，或在设置中明确点击“创建并选择 Memos Plus”。
2. 打开 Memos Plus 设置 > 任务管理 > Apple 提醒事项同步。
3. 确认提醒事项列表名称，保持默认同步标签 `#Apple同步` 或改成自己的标签。
4. 点击“测试连接”。macOS 首次使用时可能要求允许 Obsidian 访问提醒事项或日历。
5. 开启同步，再点击“立即同步”。

建议使用独立列表。所选列表中没有 Memos Plus 标识的现有提醒事项会被视为 Apple 侧新项目，并导入到设置的 Apple 导入文件。

## Markdown 格式

只有带同步标签的任务会被推送：

```markdown
- [ ] 复诊预约 #Apple同步 📅 2026-08-08
```

首次同步会追加一个不可见于阅读模式的稳定关联 ID：

```markdown
<!-- memos-plus-apple-id:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx -->
```

该 ID 用于在任务移动、标题变化或行号变化后继续识别同一项目。不要在多个任务之间复制相同的 ID；同步器检测到重复 ID 时会为后续任务重新生成。

## 同步内容

Apple 提醒事项：

- 标题
- 完成/未完成
- 截止日期；没有截止日期时使用计划日期
- 时间，以可读的 `⏰ HH:mm` 保存在 Markdown 中
- 高、中、低优先级映射
- 已建立唯一映射后的双向删除

Apple 日历不再作为任务同步目标。它只用于“日程与任务”中间的日/周日程，以及用户明确创建的日历事件。

Apple 侧没有 Memos Plus ID 的项目会被导入为带同步标签的 Markdown 任务。导入目标默认为 `我的资源/Memos/Apple 同步.md`。

## 冲突和删除

同步状态在插件现有 `data.json` 的 `appleSyncState` 字段中保存，只包含关联 ID、签名、远端 ID、时间和最近错误，不保存 Apple 账号凭据。

两侧从上次同步后都发生变化时可以选择：

- 较新修改优先
- Markdown 优先
- Apple 优先

删除只对已经同时保存本地隐藏 ID 和 Apple Reminder 唯一 ID 的项目传播：删除 Markdown 任务会删除对应提醒事项，删除对应提醒事项会删除那一条 Markdown 任务。没有建立映射的历史本地任务不会被删除；移除同步标签只会暂停同步，也不会触发删除。Apple Calendar 事件不参与任务删除。

工作台快速新增任务在同步已启用时会自动加入同步标签。顶部刷新按钮会同时刷新 Calendar 日程和 Reminders 任务；两个请求保持独立，任何一边失败都不会把任务写成日历事件。

## 桌面与移动端

- 系统桥接只在 macOS Obsidian Desktop 中执行。
- iPhone 上不会启动子进程、读取 Apple 应用或后台轮询。
- Apple 应用自身通过 iCloud 把提醒事项/日历同步到 iPhone。
- 在 iPhone Obsidian 中修改的 Markdown 任务，会在下次打开 macOS Obsidian 并执行同步时推送到 Apple。

## GitHub 调研参考

- `urishiraval/obsidian-apple-reminders-plugin`：验证 AppleScript 访问提醒事项的桌面端边界。
- `Niclassslua/obsidian-apple-reminders-plugin`：验证稳定 ID、完成状态回写和可选 EventKit helper 的实践。
- `AsakoKabe/obsidian-apple-bridge`：参考 JXA 桥接、增量状态和双向冲突处理思路。
- `YouFoundJK/plugin-full-calendar`：确认 CalDAV 可做日历双向同步，但需要远端账号配置；Memos Plus 因此选择不保存凭据的本机桥接。

Memos Plus 的实现为本项目独立 TypeScript 模块，没有复制上述插件的发布 bundle。
