# Memos Plus TODO

本文档用于记录下一步开发计划、已知风险和验收口径。它和另外两个文档配合使用：

- `docs/ARCHITECTURE.md`：先看这里，确认代码结构和模块边界。
- `docs/TODO.md`：再看这里，决定这次要做哪一项。
- `docs/CHANGELOG.md`：改完后记录这次已经完成了什么。

## 使用规则

每次开始开发前：

1. 先检查 `git status`，确认当前分支和未提交变更。
2. 快速阅读 `docs/ARCHITECTURE.md` 的相关模块说明。
3. 从本文档选择一个明确任务，不要同时大改多个方向。
4. 涉及代码行为变化时，优先补测试，再改实现。
5. 改完后运行 `npm test` 和 `npm run build`。
6. 代码发布到 Steamboy 时，使用 `npm run sync`，再执行 `obsidian vault=Steamboy plugin:reload id=memos-plus`。
7. 更新 `docs/CHANGELOG.md`，说明用户能感知到的变化。

优先级含义：

- P0：影响插件可用性、移动端稳定性、数据安全或会导致重载/闪退。
- P1：高频功能体验问题，影响日常使用效率。
- P2：结构优化、性能优化、设置整理、体验增强。
- P3：探索性功能或长期优化。

状态含义：

- TODO：尚未开始。
- DOING：正在处理。
- VERIFY：已实现，等待真实设备或真实库验证。
- DONE：已完成并发布。
- HOLD：暂缓，等待更多上下文或用户确认。

## 当前重点

### P0 - 移动端弹窗稳定性持续验证

状态：TODO

目标：

- 确认 iPhone / Obsidian Mobile 上任务弹窗、发送弹窗、模板弹窗、剪贴板弹窗连续打开关闭不会导致插件重载。
- 确认 `sessionId` 不变化，主视图不会无故重建，输入草稿不丢失。

需要关注：

- `src/mobileModalSafety.ts`
- `src/diagnostics.ts`
- `src/projectFileSuggestModal.ts`
- `src/modal.ts`
- `src/savedSearchModal.ts`
- `src/iconPicker.ts`

验收：

- 移动端连续打开关闭常用弹窗 20 次。
- 不出现插件 `onload` 再次执行。
- 不出现输入框无故 focus、键盘反复弹出、页面空白或第三方插件重载。
- 诊断日志最后 20 条能说明真实事件顺序。

### P0 - 移动端快速输入框真实设备回归

状态：TODO

目标：

- 确认主页、侧边栏、快速记录弹窗的输入框在 iPhone 上高度、光标、工具栏、发送按钮都稳定。
- 确认紫色悬浮按钮不遮挡发送按钮。

需要关注：

- `src/composerWidget.ts`
- `src/nativeComposer.ts`
- `src/composerSession.ts`
- `src/view.ts`
- `src/quickInputView.ts`
- `styles.css`

验收：

- 空内容聚焦时输入框不变成巨大黑框。
- 光标从顶部开始。
- 多行输入最多增长到限制高度，超出后内部滚动。
- 点击清空、任务、更多、发送按钮都不触发插件重载。

### P1 - 新建文件模板库标签页真实流程验收

状态：VERIFY

目标：

- 验证“标签筛选页”和“模板分组页”在发送到 / 新建文件流程中并存。
- 验证设置页能管理标签页名称、类型、标签和模板路径。
- 验证拖拽模板到分组页只影响模板分组页，不影响标签筛选页。

需要关注：

- `src/fileTemplateLibrary.ts`
- `src/projectFileSuggestModal.ts`
- `src/settings.ts`
- `src/projectDelivery.ts`

验收：

- 顶部默认页保持：搜索、项目、标签文件、最近、+。
- 自定义标签页显示在默认页之后、+ 之前。
- 标签筛选页按 Obsidian 文件标签显示文件或模板。
- 模板分组页只显示 `templatePaths` 中存在的模板。
- 空分组显示“还没有模板，可以在设置中添加，或从搜索结果拖入。”
- 移动端默认不启用拖拽。

### P1 - Templater 渲染模板的真实模板验收

状态：VERIFY

目标：

- 用真实第三方 Templater 插件验证新建文件模板库的模板渲染。
- 确认 `<% tp.date.now("YYYY-MM-DD") %>`、`<% tp.file.title %>`、`<%* ... %>` 能按目标文件上下文运行。

需要关注：

- `src/templaterAdapter.ts`
- `src/store.ts`
- `src/fileTemplateLibrary.ts`

验收：

- Templater 启用时优先走 Templater。
- Templater 不存在、API 不存在或执行失败时回退 Memos Plus 变量替换。
- 回退仍支持 `{{title}}`、`{{content}}`、`{{tag}}`、`{{source}}`、`{{folder}}`、`{{date}}`、`{{time}}`。
- 移动端失败时只提示或回退，不导致插件重载。

## 后续候选任务

### P1 - 发送到弹窗的文件/模板列表移动端体验

状态：TODO

目标：

- 让发送到弹窗在小屏上更容易点选文件、标题、模板。
- 保持底部操作栏固定，不遮挡最后一条结果。

方向：

- 检查 `memos-plus-project-list` 和 `memos-plus-file-template-list` 的移动端高度。
- 搜索框、结果区、底部操作栏分区更清晰。
- 长路径和长标题稳定省略，不撑出横向滚动。

### P1 - 任务格式全入口一致性复测

状态：TODO

目标：

- 继续验证任务按钮、发送到项目任务选项、快速记录任务按钮生成一致 Markdown。

验收：

- 不出现 `- - [ ]`、`- * [ ]`、`[ ] - [ ]`。
- 优先级、开始日期、创建日期、计划日期、截止日期不丢失。
- `TaskOptionsForm` 仍是共享入口。

### P1 - 剪贴板填入/追加链接分析真实平台复测

状态：TODO

目标：

- 用同一段链接内容测试手动粘贴、剪贴板弹窗填入、剪贴板弹窗追加。

验收平台：

- 抖音分享文本
- 哔哩哔哩链接
- 小红书分享文本
- 微信文章链接
- 普通网页链接

要求：

- 三种入口触发相同链接分析结果。
- 不新增单独链接识别逻辑。
- 移动端不自动触发 focus 循环。

### P2 - 设置页信息架构整理

状态：TODO

目标：

- 继续降低设置页复杂度，让高频设置更容易找到。
- 保持现有设置 key、默认值、保存逻辑稳定。

方向：

- “界面布局”继续作为第一入口。
- “新建文件模板库”集中放模板库位置、默认保存位置、标签页管理、按标签推荐模板。
- “发送规则”只解释输入内容发到哪里、插到哪里、变成什么格式。

### P2 - VaultMetadataIndex / TaskIndex 性能边界

状态：TODO

目标：

- 对大库场景继续减少全库扫描和重复读取。

方向：

- 文件变化时只失效必要缓存。
- 移动端延迟重建重索引。
- Saved Search 先走 metadata 条件缩小候选，再按需读取正文。
- 模板库扫描继续复用 metadata-only 索引。

### P2 - 诊断日志面板或复制入口优化

状态：TODO

目标：

- 移动端复现问题时更容易导出最近 200 条日志。

方向：

- 保留当前写入 `Memos Plus Debug Log.md` 的方式。
- 可以考虑在设置页或更多菜单提供更明显的复制入口。
- 日志中继续包含 `sessionId`、当前 modal、focus 状态、render/save 状态。

### P3 - 长期结构目标

状态：HOLD

方向：

- 继续保持输入框共享链路：`createComposerSession -> ComposerWidget -> createNativeMarkdownComposer`。
- 不新增平行输入框组件，除非现有共享链路无法承载。
- 弹窗内部只局部刷新，不重建主视图。
- 复杂功能优先抽纯函数并配测试，再接 UI。

## 开发注意事项

移动端优先避免：

- 弹窗 `onClose` 中重建主视图。
- 普通选项点击触发 `container.empty()` 或全局 render。
- `focus -> visualViewport resize -> render -> focus` 循环。
- 同时绑定 `touchend`、`pointerup`、`click` 导致一次点击执行两次。
- 每打开一次弹窗新增一批未释放的 `resize`、`scroll`、`visualViewport` 监听。
- 一次性渲染全库文件、模板、任务或图标。

发布前检查：

- `npm test`
- `npm run build`
- 需要安装到 Steamboy 时执行 `npm run sync`
- 发布后确认：
  - `package.json`、`manifest.json` 版本一致。
  - Steamboy installed plugin version 一致。
  - `community-plugins.json` 仍包含 `memos-plus`。
  - 只执行 `obsidian vault=Steamboy plugin:reload id=memos-plus`，不要整库重载。

## 已完成但需要继续观察

- 设置页顶部标签栏滚动位置保持。
- “界面布局”放到设置页最前。
- 剪贴板填入/追加复用输入变化和链接分析流程。
- 移动端弹窗诊断日志和点击锁。
- 移动端主页输入框高度、光标、键盘避让修复。
- 快速输入框清空按钮。
- 快速输入框左侧多余紫色竖线移除。
- 发送到搜索页底部“新建文件”按钮。
- 侧边栏启动设置显眼入口。
- 输入框显式 surface 配置。
- 共享 `TaskOptionsForm`。
- 新建文件模板库 Templater 渲染。
- 新建文件模板库标签页管理：标签筛选页和模板分组页。
