# Memos Plus Architecture

本文档记录当前代码结构，目标是让后续开发先定位模块，再做最小范围修改。本文只描述现状，不代表所有模块都已经达到理想性能或最终交互。

## 1. 项目总体说明

Memos Plus 是一个 Obsidian 社区插件，插件 ID 为 `memos-plus`，`manifest.json` 中 `isDesktopOnly: false`，面向桌面端和移动端。它是一个本地优先的 memo 工作台，数据以可读 Markdown 保存。

当前代码中已找到的主要功能：

- memo 快速记录：主视图输入框、命令面板快速记录弹窗、右侧栏快速输入视图、剪贴板链接收集命令。
- 年度 memo 存储：默认读写 `我的资源/Memos/YYYY.md`，通过 `src/store.ts` 和 `src/markdown.ts` 管理。
- 输入框和工具栏：主视图内嵌 Markdown/CM6 编辑器优先，失败时回退 textarea。
- memo 列表：按当前筛选结果分页显示，支持加载更多。
- 整理目录：左侧栏可显示待整理、今日新增、未归档、有链接、有图片、未完成任务等固定整理入口；整理状态保存在插件数据中，不写入 Markdown。
- 左侧栏：固定 `全部笔记`，其余目录、分组、筛选项通过 `sidebarItems` 自定义。
- 标签 / 筛选器 / 检索式：支持 memo 范围和 vault 范围的 Saved Search。
- 项目投递：支持发送到带项目标签的项目文件，并读取目标文件真实 Markdown 标题后选择插入位置。
- 发送到文件：支持按标签、最近文件、全库文件名/路径搜索选择 Markdown 文件，再选择标题插入。
- 添加项目：项目投递弹窗内支持新建项目文件。
- 发送规则管理：设置页管理 Memos Plus 输入框内容的投递规则；旧发送到项目设置会迁移成默认发送规则“发送到项目”，发送弹窗按内部规则决定目标来源和写入规则。
- 新建文件模板库：搜索不到目标文件时，可从独立 Markdown 模板库选择文件骨架模板创建新文件，再把当前输入内容插入到新文件中。
- 项目分类兼容：旧 `projectSections` 字段仍用于创建项目文件的默认标题骨架和旧配置迁移；投递弹窗不再显示固定分类按钮。
- Tasks 格式兼容：可生成 Obsidian Tasks 风格任务行。
- Callout 相关功能：输入框工具栏可切换 Callout 模式，长内容/链接内容可自动包装为 Obsidian Callout。
- 设置页面：使用顶部横向胶囊标签栏，入口为 `发送规则 / 输入工具 / 记录设置 / 任务设置 / 新建文件模板库 / 筛选与侧栏 / 界面布局 / 显示设置 / 性能与缓存 / 高级设置`；`界面布局` 标签内再用二级切换配置 `桌面主页 / 侧边栏 / 移动端` 的真实界面缩略预览和右侧属性面板。
- 图片粘贴处理：支持 Memos Plus 内置保存、交给 Image Auto Upload、自动检测三种模式。
- 图标选择器：侧栏组、筛选项、全部笔记图标支持 Lucide 图标选择。
- 移动端适配与性能逻辑：存在移动端轻量首页、移动端性能模式、性能安全模式、分页、搜索防抖、图标数量限制、部分延迟加载。
- 性能日志：`PerformanceProfiler` 支持在开启性能调试后输出关键耗时。

当前未找到或未完整实现的点：

- 未找到真正的虚拟滚动实现；当前是分页和“加载更多”。
- 已有第一阶段 `VaultMetadataIndex`：统一缓存 Markdown 文件名、路径、mtime、tags、frontmatter、headings、项目状态和模板库元信息；项目/标签文件/文件搜索/模板库和 vault Saved Search 的 metadata 条件已开始复用。
- 已有 `TaskIndex`：后台分批缓存全库 Markdown 任务行，供左侧栏整理目录的“未完成任务”和优先级/到期子分支统计与筛选使用。尚未实现全文内容索引；Saved Search 的 `text`/`task` 条件仍按需读取文件正文，但在 `match: all` 且存在 metadata 条件时会先用 metadata 缩小候选文件。
- 未找到独立的后台 worker 或分片计算调度。
- 未找到复杂动画；样式层是否有移动端重绘风险需另查 `styles.css`。

## 2. 文件结构说明

主要文件：

- `main.ts`：插件入口。加载设置，创建 `MemosPlusStore`，注册视图、命令、Obsidian URI、EditorSuggest、Ribbon 图标和设置页。
- `src/settings.ts`：设置类型、默认值、旧配置兼容迁移、顶部横向标签栏和各设置页面分组渲染。
- `src/view.ts`：Memos Plus 主视图。负责页面 shell、左侧栏、输入框、工具栏、memo 列表、侧栏菜单、项目投递入口和主要交互状态。
- `src/mobileLightHome.ts`：移动端轻量首页数据 helper 和旧布局兼容归一化。旧 `mobileHomeLayout` / `mobileHomeCustomModules` 仍可被设置归一化迁移，但旧 resolver 不再导出、不再作为设置页入口显示；移动端主视图渲染已改为读取 `mobileLayout`。
- `src/displayModules.ts`：统一显示模块系统。定义 `DisplayModule` 注册表、三端 `ViewLayout` 配置、预设模式、模块顺序、紧凑模式、模块性能等级和配置同步/归一化 helper；桌面主页、右侧栏快速输入和移动端轻量首页已接入该配置。
- `src/composerWidget.ts`：共享输入框组件。封装内嵌 Markdown 编辑器/textarea fallback、工具栏、更多菜单、图片粘贴/拖拽、Callout、代码块和 Excalidraw。
- `src/composerActions.ts`：共享输入框发送动作。主输入框、快速记录弹窗和右侧栏快速输入共用普通保存、默认发送菜单、发送到项目/模板和弹窗默认保存逻辑。
- `src/composerSession.ts`：共享输入框创建层。统一创建 `ComposerWidget` 和 `composerActions`，并集中处理快速记录/侧边栏的选中文字、剪贴板和图片初始内容填入逻辑。
- `src/quickCaptureContent.ts`：快速记录初始内容来源。统一读取当前编辑器选中文字、剪贴板文字/链接/图片，处理已有草稿冲突，并提供替换/追加/忽略询问弹窗。
- `src/quickInputView.ts`：右侧栏“ Memos Plus 快速输入”独立视图，复用 `composerSession`，并读取 `sidebarLayout` 决定是否渲染输入框、目录、数量和结果列表；桌面端走右侧栏，移动端命令回退到快速记录弹窗。
- `src/organizerPanel.ts`：整理目录纯函数。定义整理分区、整理状态、设置归一化和基于已加载 memo 的分区计算。文件名沿用旧面板命名以兼容已有字段。
- `src/taskIndex.ts`：全库任务行索引。分批读取 Markdown 文件、缓存任务行，按文件 mtime 跳过未变化文件；结果排序和卡片时间优先使用任务文本开头的收集时间或 Tasks 创建日期，并提供整理目录任务分支的数量统计和筛选结果。
- `src/store.ts`：数据读写层。负责年度 memo 文件读写、memo 增删改、状态标签切换、图片附件保存、项目和文件投递调用。
- `src/markdown.ts`：memo Markdown 协议解析与写回。定义 `MemoItem`，解析 `YYYY.md`，插入/替换/删除 memo，切换任务和标签。
- `src/filter.ts`：memo 内部视图筛选、搜索、排序、日期工具。
- `src/stats.ts`：统计数据计算。
- `src/sidebar.ts`：自定义侧栏目录树、分组、筛选项、模板、默认图标和旧 Saved Search 迁移。
- `src/savedSearch.ts`：Saved Search 数据结构、条件匹配、归一化。
- `src/savedSearchModal.ts`：创建/编辑筛选项弹窗，包含条件编辑、图标选择、分组选择、预览。
- `src/sidebarGroupModal.ts`：创建/编辑侧栏分组弹窗。
- `src/vaultIndex.ts`：metadata-only 全库文件索引。缓存文件名、路径、mtime、tags、frontmatter、headings、项目状态和模板库元信息，并响应 vault/metadata 事件失效。
- `src/vaultSearch.ts`：Saved Search 的 vault 范围检索。metadata 条件基于共享 `VaultMetadataIndex`，`text`/`task` 条件按需读取正文，并缓存文件正文。
- `src/projectSend.ts`：项目文件识别、新建项目文件内容、项目投递插入到标题下、项目最近路径。
- `src/projectFileSuggestModal.ts`：发送到项目/标签文件/最近/搜索的主弹窗，模板规则在内部应用，界面显示投递标签页和自定义标签页。
- `src/fileSend.ts`：发送到标签文件相关：标签收集、文件筛选、标题读取、插入位置。
- `src/templateManager.ts`：发送规则管理的类型、默认“发送到项目”规则、路径/变量渲染和新文件内容生成纯函数。源码仍使用 `ManagedTemplate` 等历史名称，UI 中称为“发送规则”。
- `src/templateManagerModal.ts`：设置页的发送规则编辑弹窗和模板文件/文件夹选择弹窗；编辑弹窗默认按“发到哪里 / 插到哪里 / 内容格式”显示常用设置，高级路径、变量和原始投递字段折叠到高级设置。
- `src/fileTemplateLibrary.ts`：新建文件模板库的纯函数和扫描逻辑。负责模板库路径、收藏/最近、按分类/标签搜索、变量渲染和目标文件路径生成。
- `src/tasksFormat.ts`：Obsidian Tasks 格式任务行生成和字段归一化。
- `src/callout.ts`：Callout Markdown 生成、标题解析、自动启用判断。
- `src/nativeComposer.ts`：内嵌 Markdown 编辑器封装；优先使用 Obsidian Markdown embed，失败回退 textarea。
- `src/editorSuggest.ts`：Memos Plus 输入框内的 `#` 标签补全和 `[[` 文件补全。
- `src/composerTools.ts`：输入框工具栏插入标签、列表、任务、表格、图片语法的纯函数。
- `src/composerInput.ts`：textarea fallback 的 Enter、缩进、反缩进列表行为。
- `src/iconPicker.ts`：通用 Lucide 图标选择器。
- `src/imageHandling.ts`：图片处理模式和 Image Auto Upload 检测。
- `src/linkCapture.ts`：剪贴板链接识别、网页标题提取、Markdown 链接格式化。
- `src/linkCaptureActions.ts`：剪贴板链接收集到 memo 的命令动作。
- `src/modal.ts`：快速记录和编辑 memo 弹窗；快速记录弹窗复用共享 `ComposerWidget` 和 `composerActions`，编辑 memo 仍是轻量文本编辑。
- `src/prefix.ts`：默认 memo 前缀处理。
- `src/i18n.ts`：中英文文案。
- `styles.css`：插件样式。
- `scripts/sync.mjs`：构建产物同步到本地 Steamboy vault 插件目录。
- `tests/`：Vitest 单元测试和部分源码约束测试。

## 3. 核心模块地图

| 功能模块 | 相关文件 | 关键类/函数 | 说明 |
| --- | --- | --- | --- |
| 插件入口 | `main.ts` | `MemosPlusPlugin.onload`, `activateView`, `saveSettings`, `refreshViews` | 注册视图、命令、设置页、EditorSuggest，创建 store。 |
| 快速输入侧栏 | `main.ts`, `src/quickInputView.ts`, `src/composerSession.ts`, `src/displayModules.ts` | `MEMOS_PLUS_QUICK_INPUT_VIEW_TYPE`, `MemosPlusQuickInputView`, `activateQuickInputView`, `focusComposer`, `resolveViewLayoutModules` | 右侧栏独立输入视图；命令重复执行时聚焦输入框，移动端回退快速记录弹窗。侧边栏不再渲染独有快捷按钮，只保留共用输入框，并按 `sidebarLayout` 隐藏未启用模块，隐藏数量/结果时跳过对应计算和预览加载。 |
| 快速记录内容来源 | `main.ts`, `src/modal.ts`, `src/quickInputView.ts`, `src/composerSession.ts`, `src/quickCaptureContent.ts` | `registerObsidianProtocolHandler`, `handleMemosPlusProtocol`, `createComposerSession`, `getQuickCaptureInitialContent`, `readCurrentEditorSelection`, `readClipboardTextSafely`, `mergeComposerContent`, `openQuickCaptureContentPrompt` | 快速记录和侧边栏快速输入共享选中文字/剪贴板内容获取逻辑；已有草稿按设置询问、保留、替换或追加。`obsidian://memos-plus` 可从 iPhone 快捷指令直接打开快速记录。 |
| 移动端轻量首页 | `src/view.ts`, `src/displayModules.ts`, `src/settings.ts` | `shouldRenderMobileLightHome`, `renderMobileLightHome`, `mobileLayoutModules`, `resolveViewLayoutModules` | 移动端性能模式开启时直接读取 `mobileLayout` / `DisplayModule` 决定是否渲染输入框、目录、统计、热力图、文件数量和文件列表；布局为完整模式时回到完整工作台。 |
| 统一显示模块配置 | `src/displayModules.ts`, `src/settings.ts`, `src/quickInputView.ts`, `src/view.ts` | `DISPLAY_MODULE_REGISTRY`, `normalizeViewLayout`, `resolveViewLayoutModules`, `copyViewLayoutToSurface`, `renderLayoutSettings`, `renderLayoutPreview`, `renderLayoutModuleInspector` | 主页、侧边栏、移动端的可显示区域统一注册为模块；设置页“界面布局”以真实界面缩略图 + 属性面板编辑三端 `homeLayout` / `sidebarLayout` / `mobileLayout` 配置，预览区域只显示短标签并保留配置同步按钮。`homeLayout` 已接入桌面主页，`sidebarLayout` 已接入右侧栏快速输入，`mobileLayout` 已接入移动端轻量首页。 |
| 设置加载 | `main.ts`, `src/settings.ts` | `loadData`, `normalizeSettings`, `DEFAULT_SETTINGS` | 旧配置归一化，补齐默认字段；旧项目投递设置会生成默认模板“发送到项目”。 |
| 年度数据加载 | `src/store.ts`, `src/markdown.ts` | `MemosPlusStore.readDocument`, `getYearFiles`, `parseMemoDocument` | 扫描 memo 文件夹直属 `YYYY.md` 并合并解析。 |
| memo 保存 | `src/store.ts`, `src/markdown.ts`, `src/prefix.ts` | `addMemo`, `insertMemo`, `applyDefaultPrefix` | 写入当前年份文件，保持现有 Markdown 协议。 |
| memo 编辑/删除 | `src/store.ts`, `src/markdown.ts`, `src/modal.ts` | `updateMemo`, `deleteMemo`, `EditMemoModal` | 基于 memo 自带 `filePath` 和 `range` 写回对应年度文件。 |
| memo 渲染 | `src/view.ts` | `renderTimeline`, `renderCard` | MarkdownRenderer 渲染 memo 内容，卡片右上角操作走菜单。 |
| 整理目录 | `src/view.ts`, `src/organizerPanel.ts`, `src/taskIndex.ts`, `src/settings.ts` | `renderOrganizerDirectory`, `buildOrganizerPanelSections`, `getTaskIndexOrganizerCounts`, `filterTaskIndexItems`, `selectOrganizerSection` | 左侧栏固定整理入口；普通分区基于当前已加载 memo 和插件内整理状态计算，任务分支可读取插件级 `TaskIndex` 缓存统计和展示全库任务结果，点击不重新扫描全库。 |
| 搜索 | `src/filter.ts`, `src/view.ts` | `filterMemos`, `scheduleTimelineRender` | 主搜索只过滤已加载 memo；输入框有防抖调度。 |
| 左侧栏 | `src/view.ts`, `src/sidebar.ts` | `renderSidebar`, `renderCustomDirectory`, `renderSidebarTreeItem` | 固定全部笔记 + 自定义目录树。 |
| 侧栏分组 | `src/view.ts`, `src/sidebarGroupModal.ts`, `src/sidebar.ts` | `openSidebarGroupMenu`, `SidebarGroupModal`, `createSidebarGroup` | 支持新建、编辑、复制、删除、移动。 |
| 筛选器 / 检索式 | `src/savedSearch.ts`, `src/savedSearchModal.ts`, `src/view.ts` | `SavedSearch`, `filterMemosBySavedSearch`, `openSavedSearchModal` | 支持多条件 all/any，memo/vault 两种范围。 |
| Vault 检索 | `src/vaultSearch.ts`, `src/view.ts`, `src/quickInputView.ts` | `VaultSavedSearchIndex.search`, `ensureVaultSearchCache` | 活跃 vault 检索式复用插件级 `VaultMetadataIndex` 处理 metadata 条件；`match: all` 的混合检索会先用 metadata 条件缩小候选，再只给候选文件读取正文/任务。快速输入预览会传入结果数和正文读取数上限。 |
| Vault metadata 索引 | `src/vaultIndex.ts`, `main.ts`, `src/store.ts`, `src/vaultSearch.ts` | `VaultMetadataIndex`, `registerVaultIndexInvalidation`, `getTaggedFileInfos`, `getProjectInfos`, `scanFileTemplateLibrary` | 第一阶段全库统一索引；只缓存 metadata，不读正文；项目、标签文件、文件搜索、最近文件、模板库和 vault metadata 检索复用同一份文件元信息。 |
| TaskIndex 任务索引 | `src/taskIndex.ts`, `main.ts`, `src/view.ts`, `src/settings.ts` | `TaskIndex`, `parseTaskIndexItemsFromMarkdown`, `filterTaskIndexItems`, `registerTaskIndexInvalidation`, `renderTaskIndexResults` | 缓存全库任务行、所在文件、行号、优先级、日期、任务收集时间和 mtime；mtime 只负责缓存失效，列表排序和卡片时间优先用任务自身时间。插件启动后可异步分批构建，文件变化后失效并延迟重建，整理目录任务分支从缓存读取数量和结果。 |
| 项目文件识别 | `src/vaultIndex.ts`, `src/projectSend.ts`, `src/store.ts` | `VaultMetadataIndex.getProjectFiles`, `VaultMetadataIndex.getProjectInfos`, `normalizeProjectTag` | Store 层优先通过统一索引判断项目文件；`projectSend.ts` 仍保留纯函数兼容测试和旧调用。 |
| 发送到项目 | `src/view.ts`, `src/store.ts`, `src/projectDelivery.ts`, `src/projectSend.ts`, `src/projectFileSuggestModal.ts` | `sendComposerToProject`, `sendContentToProject`, `ProjectSendModal`, `renderHeadingPicker`, `sendToFileTarget` | 弹窗按当前内部模板规则决定默认来源，再按项目/标签文件/最近/搜索/固定文件等来源选择目标文件和真实 Markdown 标题后插入。 |
| 添加项目 | `src/projectFileSuggestModal.ts`, `src/store.ts`, `src/fileTemplateLibrary.ts` | `openFileTemplateLibraryModal("project")`, `FileTemplateLibraryModal`, `createFileFromLibraryTemplate` | 弹窗中先从新建文件模板库选择文件骨架模板和文件名，再创建项目 Markdown 文件；旧 `createProject` 兼容方法仍保留。 |
| 发送规则管理 | `src/templateManager.ts`, `src/templateManagerModal.ts`, `src/settings.ts`, `src/projectFileSuggestModal.ts`, `src/projectDelivery.ts`, `src/store.ts` | `ManagedTemplate`, `TemplateEditorModal`, `createDefaultProjectTemplate`, `resolveTemplateClearAfterSend`, `resolveTemplateAfterTransferAction`, `renderDeliveryContent` | 设置页管理输入框内容的发送规则；发送弹窗内部使用传入规则，规则决定目标来源、插入位置和插入格式；清空输入框与转出 memo 后处理通过“跟随全局 / 自定义”解析，避免和全局设置冲突。 |
| 新建文件模板库 | `src/fileTemplateLibrary.ts`, `src/vaultIndex.ts`, `src/projectFileSuggestModal.ts`, `src/store.ts`, `src/settings.ts` | `FileTemplateLibraryItem`, `VaultMetadataIndex.scanFileTemplateLibrary`, `FileTemplateLibraryModal`, `createFileFromLibraryTemplate` | 搜索不到目标文件时使用；Store 层通过统一索引列出模板库 Markdown 文件，模板内容本身只负责新文件骨架，和输入格式模板分离。 |
| 项目分类兼容字段 | `src/settings.ts`, `src/projectSend.ts` | `projectSections`, `defaultProjectSection` | 旧分类字段仍兼容，并可作为默认标题兜底；投递弹窗不再显示固定项目分类按钮。 |
| 发送到标签文件 | `src/fileSend.ts`, `src/vaultIndex.ts`, `src/projectFileSuggestModal.ts`, `src/store.ts`, `src/view.ts` | `VaultMetadataIndex.getTaggedFileInfos`, `VaultMetadataIndex.searchMarkdownFileInfos`, `getFileHeadings`, `sendToFileTarget` | 标签/最近/搜索选文件，再选标题和插入位置；Store 层文件列表走统一 metadata 索引，标题无缓存时仍回退读取单个文件解析。 |
| 旧项目插入模板 | 当前未实现 | 当前已删除 | 旧 `projectInsertTemplate` / `projectTemplateOptions` / `projectInsertHeading` / `createProjectHeadingIfMissing` 不再属于设置模型；发送到项目由现代发送规则 `ManagedTemplate` 统一承担。 |
| Tasks 格式生成 | `src/templateManager.ts`, `src/projectFileSuggestModal.ts`, `src/tasksFormat.ts`, `src/taskContent.ts`, `src/store.ts`, `src/settings.ts` | `resolveTemplateTaskDecision`, `ProjectTaskOptions`, `renderTaskContentWithDetail`, `buildTasksMarkdownLine`, `renderTasksSettings` | 每个投递模板独立决定是否生成任务；全局 Obsidian Tasks 设置只决定任务行是否追加优先级、日期和重复规则等兼容字段。任务可以包住 Callout、代码块或自定义格式作为缩进详情。 |
| Callout 格式生成 | `src/callout.ts`, `src/view.ts`, `src/settings.ts` | `prepareCalloutContent`, `buildCalloutMarkdown`, `renderCalloutSettings` | 输入保存和投递前可将内容转换为 Callout。 |
| 输入框共享组件 | `src/composerWidget.ts`, `src/composerActions.ts`, `src/composerSession.ts`, `src/view.ts`, `src/modal.ts`, `src/quickInputView.ts` | `ComposerWidget`, `createComposerSession`, `createComposerActions`, `saveDefault`, `sendToProject`, `resolveComposerInitialContent` | 主页面、快速记录和侧边栏快速输入共享工具栏、图片处理、默认发送、发送到项目/模板、初始内容填入和发送失败草稿恢复逻辑。 |
| 图标选择器 | `src/iconPicker.ts`, `src/view.ts`, `src/savedSearchModal.ts`, `src/sidebarGroupModal.ts` | `IconPickerModal`, `openAllMemosIconPicker`, `renderSelectedIcon` | 基于 Obsidian `getIconIds` / `setIcon`。 |
| 设置页标签栏 | `src/settings.ts` | `MemosPlusSettingTab`, `renderSettingsTabs`, `renderSettingsTabButton`, `renderActiveSettingsTab`, `renderLayoutVisualWorkspace`, `renderLayoutModuleInspector` | 设置页使用顶部横向胶囊标签栏，只渲染当前标签内容；“界面布局”标签内使用三端切换、真实界面缩略预览和右侧属性面板，点击区域只刷新预览与属性面板。 |
| 图片粘贴 | `src/view.ts`, `src/store.ts`, `src/imageHandling.ts` | `handleComposerPaste`, `handleComposerDrop`, `saveImageAttachment`, `shouldMemosHandleImagePaste` | 支持 Image Auto Upload 兼容，不接管时不 preventDefault。 |
| 链接收集 | `main.ts`, `src/linkCapture.ts`, `src/linkCaptureActions.ts` | `captureClipboardLinkToMemos`, `resolveClipboardMarkdownLink` | 命令从剪贴板链接生成 Markdown link 并保存 memo。 |
| 移动端性能模式 | `src/performance.ts`, `src/view.ts`, `src/settings.ts`, `src/iconPicker.ts` | `shouldUseLightweightMode`, `effectivePageSize`, `debounceDelay`, `iconPickerResultLimit` | 移动/安全模式下减少初次显示数量和图标渲染数量。 |
| 缓存 / 索引 / 性能日志 | `src/performance.ts`, `src/vaultIndex.ts`, `src/vaultSearch.ts`, `src/view.ts` | `PerformanceProfiler`, `VaultMetadataIndex`, `VaultSavedSearchIndex`, `vaultSearchCacheKeys` | metadata 文件索引已统一项目/标签文件/模板库和 vault metadata 检索；正文/任务条件由 `VaultSavedSearchIndex` 按需读正文并缓存文件内容，混合检索会先做 metadata 预筛选；预览类调用可限制结果数和正文读取数。 |

## 4. 数据结构说明

### Settings

`src/settings.ts` 定义 `MemosPlusSettings`。主要字段：

- `memoFolderPath`：年度 memo 文件夹，默认 `我的资源/Memos`。
- `attachmentFolder`：图片附件文件夹，默认 `我的资源/Memos/attachments`。
- `imageHandlingMode`：图片处理方式，`auto` / `memos` / `image-auto-upload`。
- `clearAfterSave`：发送 memo 后是否清空输入框。
- `sendFailureDraftEnabled`：发送失败时是否把当前输入内容保存为恢复草稿。
- `sendFailureDraftContent`：发送失败后保存的恢复草稿内容；下次创建共享输入框时会自动填入，成功发送后清空。
- `sortOrder`：列表排序，`newest` / `oldest`。
- `pageSize`：桌面端分页条数，移动/安全模式会被 `effectivePageSize` 覆盖。
- `performanceDebugMode`：性能日志开关。
- `mobilePerformanceMode`：移动端性能模式开关。
- `performanceSafeMode`：性能安全模式开关。
- `showArchived`：非归档视图是否显示归档 memo。
- `mobileFab`：移动端浮动记录按钮。
- `mobileLightHomeEnabled`：移动端轻量首页开关，默认开启；仅在 `mobilePerformanceMode` 开启且布局不是“完整模式”时生效。
- `mobileHomeLayout` / `mobileHomeCustomModules`：旧移动端布局字段，仅用于缺少 `mobileLayout` 时的兼容迁移，不再在设置 UI 中作为独立布局入口显示。
- `homeLayout` / `sidebarLayout` / `mobileLayout`：统一显示模块系统的三端布局配置。每项包含 `mode`、`visibleModules`、`order` 和 `compactMode`；`mode` 可为完整、快速输入、导航、项目、任务、极简或自定义。`homeLayout` 已用于桌面主页侧栏、搜索、设置、刷新、输入框、文件数量和列表的渲染控制；`sidebarLayout` 已用于右侧栏快速输入的模块渲染、数量计算和结果列表加载控制；`mobileLayout` 已用于移动端轻量首页渲染控制。
- `mobileLightHomeRecentCount`：轻量首页每个分区最多显示的 memo 数量，默认 10。
- `mobileLightHomeSections`：轻量首页 `收集箱` / `最近记录` 的显示开关和区域高度。
- `mobileLightHomeShowLaterButton`：轻量首页是否显示“稍后整理”按钮；按钮复用普通 memo 保存链路。
- `language`：`zh` / `en`。
- `defaultPrefix`：默认前缀，`none` / `list` / `task`。
- `allMemosIcon`：全部笔记图标。
- `savedSearches`：自定义筛选规则数组。
- `sidebarItems`：自定义侧栏目录树。
- `linkCaptureDefaultTags`：剪贴板链接收集默认标签。
- `quickInputEnabled`：是否启用右侧栏快速输入命令和视图。
- `quickInputAutoOpen`：插件加载并等待 Obsidian 布局就绪后是否自动打开 Memos Plus 侧边栏；自动打开只显示侧边栏，不聚焦输入框，避免移动端弹出键盘。
- `quickInputPreserveDraft`：关闭侧边栏时是否保留未发送草稿。
- `quickInputDefaultSendAction`：侧边栏输入框发送按钮默认行为，复用 `DefaultSendAction`。
- `quickInputDraft`：右侧栏快速输入未发送草稿，只保存在插件设置中。
- `quickCaptureAutoSelection`：打开快速记录时是否优先读取当前编辑器选中文字。
- `quickCaptureDetectClipboard`：没有选中文字时是否检测系统剪贴板。
- `quickCaptureClipboardDesktopMode`：桌面端剪贴板内容处理方式，`ask` / `replace` / `append` / `off`。
- `quickCaptureClipboardMobileMode`：移动端剪贴板内容处理方式，`ask` / `replace` / `append` / `off`。
- `quickCaptureExistingContentMode`：输入框已有内容时的处理方式，`ask` / `keep` / `replace` / `append`。
- `quickCaptureRecognizeClipboardLinks`：剪贴板内容是网址时是否按链接来源标记。
- `composerBorderColor`：共享输入框整体边框、聚焦光晕和拖拽提示颜色。
- `composerBackgroundColor`：共享输入框框内底色；空值表示跟随 Obsidian 主题。
- `organizerPanelEnabled`：整理目录总开关，字段名沿用旧面板设置以兼容旧数据。
- `organizerPanelDefaultCollapsed`：旧整理面板折叠兼容字段；当前整理目录不使用。
- `organizerPanelDesktopHeight` / `organizerPanelMobileHeight`：旧整理面板高度兼容字段；当前整理目录不在设置页显示。
- `organizerPanelSections`：整理目录各入口显示/隐藏配置；历史高度字段仍归一化但当前 UI 不使用。
- `organizerMemoStates`：按 memo id 保存整理状态，包含是否已整理、整理时间、最后动作和目标路径；不写入 memo Markdown。
- `taskVaultFilterEnabled`：是否启用全库任务筛选；开启后整理目录任务分支默认筛选整个 vault，关闭后只筛选 Memos Plus 自己的记录。
- `taskIndexEnabled`：是否启用任务索引缓存；开启后全库任务筛选从缓存读取，避免每次点击任务分支都重新扫描仓库。
- `taskIndexAutoBuild`：启动后是否自动在后台建立任务索引。
- `taskIndexDelayOnMobile`：移动端是否延迟建立任务索引，避免 iPhone 打开插件时抢占资源。
- `projectTag`：识别项目文件的标签。
- `projectFolderPath`：新项目默认保存位置。
- `defaultProjectSection`：默认项目分类标题。
- `showArchivedProjects`：项目列表是否显示归档/完成项目。
- `projectSections`：项目分类列表。
- `recentProjectPaths`：最近投递项目路径。
- `managedTemplates`：发送规则配置数组，供发送弹窗内部投递规则使用；旧项目投递设置缺省时会迁移生成“发送到项目”。字段名沿用历史命名，界面中显示为“发送规则”。
- `fileTemplateLibraryFolder`：新建文件模板库所在文件夹，默认 `我的资源/模板`。
- `fileTemplateLibraryDefaultFolder`：用模板库创建新文件时的默认保存位置，默认 `我的资源/Memos`。
- `fileTemplateLibraryRecent`：最近使用的新建文件模板路径数组。
- `fileTemplateLibraryDefaults`：按标签记录的默认新建文件模板路径映射，例如 `病 -> 我的资源/模板/疾病.md`。
- `sendToFileEnabled`：发送到文件功能开关。
- `sendToFileDefaultTag`：发送到文件默认标签。
- `sendToFileCommonTags`：发送到文件常用标签。
- `sendToFileDefaultInsertPosition`：默认插入位置。
- `sendToFileNoHeadingBehavior`：无标题文件处理方式。
- `recentFileTargetPaths`：最近投递文件路径。
- `tasksFormatEnabled` 及 `task*` 字段：Tasks 格式兼容设置；`taskPromptOnCreate` 控制输入框任务按钮和模板待办任务发送时是否先弹出任务设置，默认发送不受影响。
- `callout*` 字段：Callout 启用、类型、折叠、标题和自动启用阈值。

### Memo 数据

`src/markdown.ts`：

- `MemoItem`：单条 memo 的运行时结构，包含 `id`, `filePath`, `date`, `time`, `datetime`, `year`, `month`, `weekday`, `content`, `tags`, `isPinned`, `isStarred`, `isArchived`, `hasOpenTask`, `hasClosedTask`, `hasImage`, `hasLink`, `range`。
- `MemoRange`：原始 Markdown 中该 memo 块的起止行，用于精确写回。
- `MemoDocument`：`source` 和 `memos`。
- `NewMemoInput`：新增 memo 所需 `date`, `time`, `content`。

状态不是额外数据库字段，而是内容标签：

- `#置顶` 对应 `isPinned`。
- `#收藏` 对应 `isStarred`。
- `#归档` 对应 `isArchived`。

### 整理状态

`src/organizerPanel.ts`：

- `OrganizerPanelSectionId`：整理目录入口 id，当前包括 `inbox`, `today`, `unarchived`, `links`, `images`, `tasks`。
- `OrganizerMemoState`：按 `memoId` 保存 `organized`, `organizedAt`, `lastAction`, `targetPath`。
- `OrganizerMemoStates`：持久化在 `settings.organizerMemoStates` 的 memo 整理状态映射。
- `buildOrganizerPanelSections()`：基于已加载 memo、整理状态和设置生成各分区预览，不读取 vault 文件。
- `filterMemosForOrganizerSection()`：主列表点击“查看全部”时复用的本地过滤函数。

### 目录 / 分组结构

`src/sidebar.ts`：

- `SidebarGroupItem`：`id`, `type: "group"`, `title`, `icon`, `collapsed`, `children`。
- `SidebarSearchItem`：`id`, `type: "search"`, `title`, `icon`, `searchId`。
- `SidebarItem`：两者联合类型。

`sidebarItems` 只保存侧栏配置，不保存 memo 内容。

### 筛选器 / 检索式结构

`src/savedSearch.ts`：

- `SavedSearch`：`id`, `name`, `match`, `conditions`, `searchScope`。
- `SavedSearchCondition`：`field`, `operator`, `value`, `valueTo`。
- `SavedSearchField`：`tag`, `text`, `date`, `status`, `image`, `link`, `task`, `year`, `path`。
- `SavedSearchOperator`：`contains`, `notContains`, `equals`, `notEquals`, `before`, `after`, `between`, `exists`, `notExists`。
- `SavedSearchScope`：`memos` 或 `vault`。

### 项目和文件投递结构

`src/projectSend.ts`：

- `ProjectInfo`：项目文件、项目名、状态、更新时间、是否最近。
- `ProjectStatus`：`进行中`, `暂停`, `完成`, `归档`。

`src/fileSend.ts`：

- `TaggedFileInfo`：文件、名称、路径、标签、匹配标签、更新时间。
- `FileHeadingInfo`：标题文本、标题层级、行号。
- `FileSendTarget`：目标标题和插入位置。
- `FileInsertPosition`：`heading-top`, `heading-bottom`, `file-end`, `file-start`, `new-heading`。`new-heading` 会根据 `newHeadingName`、`newHeadingLevel`、`newHeadingPosition` 和 `existingHeadingBehavior` 创建标题后插入内容；`file-start` 和新标题的文件开头位置都会通过 `getSafeFileStartInsertIndex()` 避开 YAML frontmatter。
- `NoHeadingBehavior`：`ask`, `file-end`, `file-start`。

`src/templateManager.ts`：

- `ManagedTemplate`：Memos Plus 发送规则，包含规则名称、发送用途、目标文件来源、识别标签、模板文件、固定文件、默认保存位置、文件名规则、默认标签、插入标题、插入位置、插入格式、新建标题名称/级别/位置/同名处理、任务格式触发规则、任务与内容格式同时启用时的组合方式、找不到标题时是否创建、发送成功后清空输入框与原 memo 处理的“跟随全局/自定义”模式，以及高级自定义插入格式。
- `ManagedTemplateType`：`general`, `project`, `tag-file`, `medical`, `case`, `software`, `literature`, `custom`。

`src/fileTemplateLibrary.ts`：

- `FileTemplateLibraryItem`：新建文件模板库中的一个 Markdown 模板，包含路径、名称、分类、标签、更新时间、是否收藏、是否最近和可选 `TFile`。
- `FileTemplateLibrarySettings`：模板库路径、默认保存位置、收藏、最近和按标签默认模板映射。
- `scanFileTemplateLibrary()`：按设置扫描模板库文件夹下的 Markdown 文件，优先使用 metadataCache 读取标签。
- `renderFileTemplateContent()`：用模板文件内容渲染 `{{title}}`、`{{date}}`、`{{time}}`、`{{datetime}}`、`{{content}}`、`{{tag}}`、`{{source}}`、`{{folder}}` 等变量。
- `buildFileTemplateTargetPath()`：把搜索词/标题转换成默认保存文件夹下的 `.md` 路径。
- `TemplateTargetSource`：`project-tag`, `specific-tag`, `recent-file`, `vault-search`, `fixed-file`, `new-file`, `default-memo`。
- `TemplateInsertLocation`：`file-start`, `file-end`, `heading`, `new-heading`, `ask`。
- `TemplateInsertFormat`：`note`, `task`, `callout`, `code`, `link`, `custom`。
- `TemplateAfterTransferAction`：`keep`, `archive`, `delete`。
- `TemplateTaskMode`：`none`, `always`, `ask`, `auto`，分别表示不使用任务格式、始终使用、发送时询问、按模板条件自动使用。
- `taskAuto*` 字段：发送规则级自动任务条件，包括关键词、标签、开头文字、目标标题、插入格式是否为待办任务、规则名称是否包含任务、命中后是否仍需确认。
- `taskContentMode`：任务与内容格式同时启用时的组合方式。`task-with-detail` 会先生成任务行，再把 Callout、代码块或自定义格式缩进为任务详情；`task-only` 保留旧的只生成任务行；`ask` 会在发送时询问。
- `TemplateFilenameRule`：`title`, `title-date`, `date-title`, `datetime-title`, `custom`。
- `TemplateVariableContext`：模板变量上下文，支持 title/date/time/datetime/content/tag/source/folder。

### Tasks 结构

`src/tasksFormat.ts`：

- `TasksMarkdownOptions`：优先级、项目标签、开始/计划/截止日期、重复、创建日期。
- `ProjectTaskOptions`：继承 `TasksMarkdownOptions` 并增加 `isTask`。
- `TaskPriority`：`none`, `highest`, `high`, `medium`, `low`, `lowest`。
- `TaskRecurrence`：`none`, `daily`, `weekly`, `monthly`, `yearly`, `custom`。

### Callout 结构

`src/callout.ts`：

- `CalloutSettings`：Callout 启用、类型、折叠方式、标题模式、自动启用阈值。
- `CalloutContext`：文件、项目、标题、时间上下文。
- `PreparedCalloutContent`：转换后的内容和 `preformatted` 标记。

### 图标字段

- `allMemosIcon`：全部笔记图标。
- `SidebarGroupItem.icon`：侧栏分组图标。
- `SidebarSearchItem.icon`：侧栏筛选项图标。
- `SavedSearchModalMeta.icon`：保存筛选项时写入侧栏项的图标。

### 缓存相关字段

- `MemosPlusView.vaultSearchIndex`：主视图内的 `VaultSavedSearchIndex` 实例。
- `MemosPlusView.vaultSearchCacheKeys`：当前 vault 检索缓存 key。
- `MemosPlusView.vaultSearchResults`：当前 vault 检索结果。
- `VaultSavedSearchIndex.contentCache`：按文件 path + mtime 缓存正文。
- `MemosPlusPlugin.taskIndex`：插件级 `TaskIndex` 实例，按文件 path + mtime 缓存任务行，并为整理目录任务分支提供按任务收集/创建时间排序的全库数量与结果。

未找到单独持久化的全文索引结构；当前 `VaultMetadataIndex` 与 `TaskIndex` 都是运行时缓存。

## 5. 主界面渲染流程

主视图类是 `src/view.ts` 的 `MemosPlusView`。

打开页面的大致流程：

1. `MemosPlusView.onOpen()` 设置 `visibleCount = pageSize()`，然后调用 `reload()`。
2. `reload()` 通过 `this.plugin.store.readDocument()` 读取并解析年度 memo 文件，随后调用 `render()`。
3. `render()` 清理主视图内容；移动端且 `mobilePerformanceMode`、`mobileLightHomeEnabled` 开启且布局不是“完整模式”时创建 `.memos-plus-mobile-light-shell` 并调用 `renderMobileLightHome()`，否则创建 `.memos-plus-shell` 并调用 `renderSidebar()`、`renderMain()`、`renderMobileFab()`。
4. `renderMobileLightHome()` 通过 `resolveViewLayoutModules(this.plugin.settings.mobileLayout, "mobile")` 决定是否渲染侧边栏、输入框、文件数量或 memo 列表；隐藏统计/热力图/列表时不会创建对应 DOM。
5. `renderSidebar()` 可接收显示选项；桌面完整界面默认计算统计并渲染左侧统计、热力图、全部笔记、自定义目录树，移动端自定义布局可跳过统计、热力图、整理目录、任务目录或自定义目录。
6. `renderMain()` 渲染标题、搜索框、刷新按钮、输入框和 timeline 容器。
7. `renderComposer()` 渲染输入框、工具栏和发送按钮。
8. `renderSidebar()` 在设置开启时调用 `renderOrganizerDirectory()` 渲染左侧栏整理目录；普通整理项使用 `this.memos` 和 `organizerMemoStates`，未完成任务及子分支在 `taskVaultFilterEnabled` 和 `taskIndexEnabled` 同时开启时从插件级 `TaskIndex` 读取数量，否则回退到当前 Memos Plus 记录。
9. `renderTimeline()` 根据当前状态过滤 memo 或 vault 检索结果，并渲染 memo 列表。
10. `renderCard()` 渲染单条 memo 卡片。

可能触发重新渲染的位置：

- `reload()`：重新读取数据并整页 render。
- 搜索框输入：更新 query，重置 `visibleCount`，调用 `scheduleTimelineRender()`。
- 左侧栏切换视图/筛选项：更新状态，调用 `renderTimelineOnly()`。
- 修改 memo、删除、置顶、收藏、归档、勾选任务：store 写回后调用 `reload()`。
- 保存 memo 或发送到项目/文件后：调用 `reload()`。
- 修改设置：`saveSettings()` 后 `refreshViews()`，各视图 `reload()`。

## 6. 输入框和工具栏

输入框主实现位于 `src/composerWidget.ts` 的 `ComposerWidget`。三处入口都通过 `src/composerSession.ts` 的 `createComposerSession()` 创建共享输入框、发送动作和可选初始内容填入逻辑。

相关结构：

- 外层：`.memos-plus-composer`。
- 编辑器 host：`.memos-plus-composer-editor`。
- 外观变量：`ComposerWidget.applyAppearanceSettings()` 会把 `composerBorderColor` 和 `composerBackgroundColor` 写入 `.memos-plus-composer` 的 CSS 变量，主视图、快速记录和侧边栏快速输入共用。
- 编辑器创建：`createNativeMarkdownComposer()`，定义在 `src/nativeComposer.ts`。
- 发送按钮：`ComposerWidget` 创建 `.memos-plus-save-button`，点击调用传入的 `onSend`；实际默认保存/发送到项目由 `src/composerActions.ts` 决定。侧边栏可通过 `createComposerSession()` 传入自己的默认发送方式，发送按钮 tooltip 会跟随该入口。普通保存或项目/文件投递失败时，`createComposerActions()` 会按设置把当前内容写入 `sendFailureDraftContent`，下次 `createComposerSession()` 创建输入框时由 `resolveComposerInitialContent()` 自动恢复。
- 发送到项目/模板：不再是主工具栏固定按钮；通过发送按钮默认行为或更多发送菜单进入 `createComposerActions().sendToProject()`。
- 图片按钮：`ComposerWidget` 工具栏 `image` 按钮，选择本地图片后调用外部传入的 `saveImageAttachment`。
- Callout 按钮：当 `settings.calloutEnabled` 开启时显示，点击切换组件内 `manualCalloutMode`。
- 表格按钮：`table-2` 图标按钮，点击打开 `showTablePicker()`。
- 代码块、Excalidraw、隐藏工具和更多菜单：都在 `ComposerWidget` 内根据 `toolbarTools` 设置渲染。

工具栏按钮创建位置：

- `src/composerWidget.ts` 的 `renderTools()` 和 `getComposerTools()`。

工具栏文本处理：

- `src/composerTools.ts`：`applyComposerTool`, `insertTableAtCursor`, `formatImageEmbedInsertion`。
- `src/composerWidget.ts`：调用 `applyTextTool()`, `insertTable()`, `insertText()` 和附件创建回调。

如果后续要添加一个新工具栏按钮，优先修改：

1. `src/composerWidget.ts`：在共享工具列表中增加按钮、tooltip、点击行为，确保主视图、快速记录和右侧栏快速输入同时获得能力。
2. 如果只是插入/格式化纯文本，可在 `src/composerTools.ts` 增加纯函数和测试。
3. 如需设置开关，再去 `src/settings.ts` 增加字段和设置 UI。

## 7. 设置页面结构

设置页位于 `src/settings.ts`。

设置页使用顶部横向胶囊标签栏：

- `MemosPlusSettingTab.display()`：入口；先渲染顶部标签，再渲染当前标签内容。
- `renderSettingsTabs()`：渲染横向可滚动标签栏。
- `renderSettingsTabButton()`：渲染单个标签按钮，点击后只切换 `currentSettingTab` 并重新显示当前设置页。
- `renderActiveSettingsTab()`：只渲染当前标签对应内容，避免一次性展开所有设置。

当前顶部标签：

- `发送规则`：`renderSendRulesSettings()`，管理发送规则、发送到文件设置和发送弹窗标签页管理。
- `输入工具`：`renderInputToolSettings()`，快速记录内容来源、工具栏显示、附件文件夹、图片处理、Callout、代码块和 Excalidraw；Callout 标题模板折叠在高级选项里。
- `记录设置`：`renderRecordSettings()`，普通记录保存位置、默认前缀、默认发送方式、保存后清空、失败草稿和链接标签。
- `任务设置`：`renderTasksSettings()`，Obsidian Tasks 兼容设置、任务索引摘要入口和每条发送规则的任务触发规则；任务索引的完整缓存控制在“性能与缓存”。
- `新建文件模板库`：`renderFileTemplateLibrarySettings()`，只管理搜索不到文件时用于创建新文件的 Markdown 模板库；按标签推荐模板折叠在高级选项里。
- `筛选与侧栏`：`renderDirectoryFilterSettings()`，筛选概览、整理目录和任务分支显示设置。
- `界面布局`：`renderLayoutSettings()`，内部二级切换 `桌面主页 / 侧边栏 / 移动端`，中间渲染真实界面缩略预览，右侧渲染当前区域属性面板；隐藏模块以半透明虚线框保留，并保留三端显示配置同步按钮。
- `显示设置`：`renderDisplaySettings()`，输入框外观、排序、分页和归档显示。
- `性能与缓存`：`renderPerformanceDataSettings()`，性能调试、移动端性能模式、安全模式和任务索引缓存。
- `高级设置`：`renderAdvancedSettings()`，兼容说明、导入导出和其他不常用占位。

旧独立“项目设置”页和旧项目插入模板编辑器已从设置 UI 中移除；`renderSendToFileSettings()` 现在由“发送规则”入口调用。新的设置页入口不再切到独立“项目”页；发送到项目相关规则应优先通过 `ManagedTemplate` 管理，旧项目投递字段仅在归一化和兼容写入层保留。

如果后续新增设置项：

1. 先在 `MemosPlusSettings` 和 `DEFAULT_SETTINGS` 添加字段。
2. 在 `normalizeSettings()` 中兼容旧数据。
3. 按功能归属放入对应 `render*Settings()` 方法。
4. 文案在 `src/i18n.ts` 增加。
5. 如设置影响视图，确认 `saveSettings()` 是否需要刷新视图。

## 8. 项目投递流程

用户点击右侧“发送”按钮且默认发送方式为项目，或在“每次询问”菜单中选择发送到项目/文件后，流程如下：

1. `src/composerSession.ts` 创建的共享发送动作根据 `defaultSendAction` 调用项目投递流程；“默认发送”按钮仍通过普通 memo 保存链路。
2. `composerActions.sendToProject()` 获取当前 composer 内容，并调用 `src/projectDelivery.ts` 的 `sendContentToProject()`。
3. `sendContentToProject()` 选择初始模板和初始模式，然后调用 `store.getProjects()`。
4. `src/store.ts` 的 `getProjects()` 调用 `src/projectSend.ts` 的 `getProjectInfos()`。
5. `getProjectInfos()` 通过 `app.vault.getMarkdownFiles()` 和 `metadataCache.getFileCache()` 查找带项目标签的文件，并计算状态、更新时间、最近权重。
6. `projectDelivery.selectProjectTarget()` 打开 `src/projectFileSuggestModal.ts` 的 `ProjectSendModal`。
7. 弹窗不显示模板选择器；`sendContentToProject()` 传入的初始模板会在内部应用，模板的 `targetSource` 会影响默认打开的页：
   - `project-tag`：项目。
   - `specific-tag`：指定标签页。
   - `recent-file`：最近。
   - `vault-search` / `new-file`：搜索。
   - `fixed-file`：直接进入固定文件标题选择。
   - `default-memo`：只显示“默认发送”，调用普通 memo 保存。
8. 弹窗支持模式：
   - 项目：`renderProjectList()`。
   - 标签文件：`renderTagPicker()` -> `renderTaggedFiles()` -> `renderHeadingPicker()`。
   - 最近：`renderRecentFiles()`。
   - 搜索：`renderFileSearch()`。
9. 项目列表或文件列表没有匹配结果时，弹窗可显示“使用模板创建”，通过 `FileTemplateLibraryModal` 从新建文件模板库选择模板文件和新文件名。
10. 模板创建路径调用 `options.onCreateFromFileTemplate()`，实际由 `src/store.ts` 的 `createFileFromLibraryTemplate()` 创建文件；自定义标签页会把当前标签传给模板变量和默认标签。
11. 新文件创建完成后，项目模式和标签文件/搜索模式都进入真实 Markdown 标题选择流程；当前模板标题只作为默认高亮或“新建标题后插入”的标题来源。
12. 选择项目文件、标签文件、最近文件或搜索文件后，弹窗使用 `getFileHeadings()` 获取标题，再选择标题和插入位置；无标题文件提供“插入文件开头 / 插入文件末尾 / 新建标题后插入”，点击后同样按当前模板任务规则决定是否保存为任务。
13. `ProjectSendModal` 返回 `ProjectSendChoice`，其中包含内部选定的 `template`。
14. `sendContentToProject()` 根据 choice：
    - `fileTarget` 存在：调用 `store.sendToFileTarget()`。
    - `mode === "project"` 时仍更新最近项目；普通文件目标更新最近文件。
15. `store.sendToFileTarget()`：
    - `renderDeliveryContent()` 会先根据模板 `insertFormat` 生成普通笔记、Callout、代码块或自定义格式内容；如果模板选择结果带 `task.isTask`，再由 `renderTaskContentWithDetail()` 按 `taskContentMode` 包装为任务。
    - 开启 Obsidian Tasks 兼容时，任务行由 `buildTasksMarkdownLine()` 追加优先级、日期和重复规则，否则生成普通 Markdown `- [ ]`。
    - `taskContentMode === "task-with-detail"` 时，Callout、代码块或自定义格式会作为任务下方缩进详情保留；`task-only` 仅生成任务行；`ask` 在发送弹窗的任务设置里让用户选择。
    - 非任务发送仍按模板 `insertFormat` 生成内容；未传入模板规则的调用使用 Store 内置普通笔记格式兜底。
    - 调用 `insertContentAtFileTarget()` 写入目标标题/文件位置。
16. 成功后更新最近路径、保存设置、通过 `resolveTemplateClearAfterSend()` 在发送规则“跟随全局 / 自定义”和全局 `clearAfterSave` 之间解析清空行为，然后 `reload()`。

## 9. 筛选器 / 检索式流程

左侧筛选器：

- 侧栏固定入口 `全部笔记` 在 `src/view.ts` 的 `renderSidebar()` 中渲染。
- 自定义目录树由 `renderCustomDirectory()` 渲染，数据来自 `settings.sidebarItems`。
- 目录结构归一化在 `src/sidebar.ts` 的 `normalizeSidebarItems()`。

保存筛选器：

- `SavedSearch` 保存在 `settings.savedSearches`。
- `SidebarSearchItem` 保存在 `settings.sidebarItems`，通过 `searchId` 指向 Saved Search。
- 创建/编辑弹窗是 `src/savedSearchModal.ts` 的 `SavedSearchModal`。

匹配数量：

- memo 范围：`countForSavedSearch()` 调用 `filterMemosBySavedSearch()`。
- vault 范围：当前侧栏数量可能显示 `"..."`，主动选择后由 `ensureVaultSearchCache()` 执行 vault 检索。
- 分组数量：`countForGroup()` 汇总子项数量；有延迟或 vault 项时可能返回 `"..."`。

筛选 memo：

- `currentFilteredMemos()` 先调用 `filterMemos()` 处理 mode、query、tag、year、归档和排序。
- 如果有 active Saved Search，再调用 `filterMemosBySavedSearch()` 叠加自定义条件。

全库搜索：

- Saved Search 的 `searchScope === "vault"` 时使用 `src/vaultSearch.ts`。
- `VaultSavedSearchIndex.search()` 遍历共享 `VaultMetadataIndex` 的 metadata entries。
- 对 `text` 和 `task` 条件会读取正文；其他字段尽量使用共享 metadata 索引。
- 当 `match === "all"` 且条件中同时有 metadata 条件和正文/任务条件时，会先用 metadata 条件过滤候选文件，再读取候选文件正文。
- `search()` 支持可选的 `maxResults` / `maxContentReads`，快速输入侧边栏的 vault 预览会传入限制，主页面完整搜索暂不截断。
- `contentCache` 按 path + mtime 缓存正文。

可能导致性能问题的位置：

- 左侧每个筛选项数量可能对 memo 数组重复筛选。
- vault 搜索仍会遍历共享 metadata entries；正文/任务条件仍会按需读取候选文件正文。
- `SavedSearchModal` 的 vault 预览可能触发全库搜索。
- 标签建议和文件补全中仍有 `getMarkdownFiles()` 调用。

## 10. 性能风险点

本节只记录风险，不在本文档任务中修复。

| 风险点 | 文件/函数 | 可能问题 | 后续优化建议 |
| --- | --- | --- | --- |
| 打开视图读取所有年度 memo | `src/store.ts` `readDocument()` | memo 文件夹下所有 `YYYY.md` 都会被读取和解析，年度文件很大时打开慢。 | 建立年度/mtime 缓存；初次只读最近年份或最近范围；后台补全旧数据。 |
| 整页重绘 | `src/view.ts` `render()` | 每次 reload 清理主视图并重建 sidebar/main/composer/timeline。 | 将 sidebar、composer、timeline 拆为局部刷新；memo 写回后只更新数据和列表。 |
| memo 卡片仍可能创建较多 DOM | `src/view.ts` `renderTimeline()` | 已分页，但不是虚拟滚动；每次切换筛选会重建可见卡片。 | 后续引入虚拟列表或更细粒度 diff。 |
| 多个侧栏筛选项重复扫描 memo | `src/view.ts` `countForSavedSearch()`, `countForGroup()` | 每个筛选项都可能过滤一遍 memos，筛选项多时成本叠加。 | 数据变更后批量计算并缓存数量；可见优先。 |
| 统计每次基于全量 memo | `src/view.ts` `renderSidebar()`, `src/stats.ts` `computeMemoStats()` | sidebar 渲染时遍历全量 memo 计算统计。 | 读取阶段顺便汇总；按文件增量更新统计。 |
| 热力图每次重新计算 | `src/view.ts` `renderHeatmap()` | 仍遍历 memo 建日期计数。 | 缓存日期计数；移动端只按需显示。 |
| 整理目录分区重复过滤 | `src/organizerPanel.ts` `buildOrganizerPanelSections()` | 当前只基于已加载 memo 计算数量，但分区增加后仍可能重复遍历 memo。 | 若分区继续增多，可在一次遍历内汇总各分区或缓存分区结果。 |
| TaskIndex 初次构建 | `src/taskIndex.ts` `TaskIndex.rebuild()` | 全库任务索引需要分批读取 Markdown 正文；移动端默认延迟，桌面端后台构建。 | 继续保持批处理和 mtime 跳过；后续可增加更明确的进度 UI 或空闲调度。 |
| vault Saved Search 正文条件 | `src/vaultSearch.ts` `VaultSavedSearchIndex.search()` | metadata 条件已复用 `VaultMetadataIndex`；快速输入预览有读取上限，但主页面纯正文/纯任务检索仍可能读取大量文件正文。 | 后续为主页面完整搜索做分片/中断、进度提示和可选全文缓存。 |
| metadata 索引初次构建 | `src/vaultIndex.ts` `VaultMetadataIndex.getEntries()` | 第一次打开项目/标签文件/模板库等入口时会遍历一次 Markdown metadata。 | 继续保持不读正文；可在空闲时预热，或在文件变更时更细粒度增量更新。 |
| 标签文件/项目/模板库列表 | `src/store.ts`, `src/vaultIndex.ts` | 已复用统一 metadata 索引，但排序和过滤仍在调用时执行。 | 热门 tag、项目 tag、模板库 folder 可增加派生缓存。 |
| Link Suggest 每次取全库 Markdown 文件 | `src/editorSuggest.ts` `MemosPlusLinkSuggest.getSuggestions()` | `[[` 补全每次触发都 `getMarkdownFiles()` 并 map/filter。 | 缓存文件列表，监听 vault rename/create/delete 更新。 |
| Saved Search tag options 扫描 vault tags | `src/view.ts` `vaultTagCounts()` | 打开筛选器弹窗时扫描 metadata tags。 | 缓存 vault tag counts。 |
| 设置保存触发所有视图 reload | `main.ts` `saveSettings()`, `refreshViews()` | 某些设置只影响局部 UI，却会让所有 Memos Plus 视图重读和重绘。 | 按设置影响范围决定局部刷新或 reload。 |
| 图片粘贴内置保存可能处理大文件 | `src/view.ts` `handleImageFile()`, `src/store.ts` `saveImageAttachment()` | 大图片读取 ArrayBuffer + vault 写入可能阻塞体验；多图串行处理。 | 显示异步进度；大图后台处理；必要时压缩交给专门插件。 |
| 图标选择器默认已限制但仍需注意 | `src/iconPicker.ts` `renderList()` | 已限制 100/50，但搜索仍会过滤全部 icon id。通常可接受。 | 若图标库变大，可预索引 lower-case 名称。 |
| 设置页按标签渲染 | `src/settings.ts` `renderActiveSettingsTab()` | 当前风险较低；顶部标签只渲染当前设置页，模板编辑弹窗已改为常用分组 + 高级折叠。 | 保持按标签渲染，继续避免一次性展开复杂设置。 |

已有的性能保护：

- `src/performance.ts` 提供移动端 20 条页大小、搜索防抖、图标数量限制。
- `src/view.ts` timeline 搜索渲染有防抖。
- `src/projectFileSuggestModal.ts` 项目/标签/文件搜索有防抖。
- `src/iconPicker.ts` 图标列表限制渲染数量。
- `src/settings.ts` 设置页面只渲染当前顶部标签页面。
- `src/imageHandling.ts` 检测到 Image Auto Upload 时可不接管 paste。

## 11. 后续给 Codex 的开发约定

后续开发请遵守：

- 每次只改一个功能点。
- 开始改动前先阅读 `docs/ARCHITECTURE.md`。
- 先定位相关文件，再修改代码。
- 不做无关重构。
- 不改无关样式。
- 不改无关设置字段。
- 修改前先说明计划改哪些文件。
- 修改后说明实际改了哪些文件。
- 对 Obsidian 插件源代码修改后，优先使用项目已有脚本验证；需要同步到 Steamboy 时优先使用 `npm run sync` 和 `obsidian vault=Steamboy plugin:reload id=memos-plus`。
- 如果只是文档修改，不需要同步插件或 reload。
- 对性能问题，先用 `performanceDebugMode` 和真实耗时定位最重的 2-3 个函数，再改代码。
- 对 UI 问题，优先在 `src/view.ts`、对应 modal 文件或 `src/settings.ts` 定位，不要先改全局样式。
- 对数据写入问题，优先看 `src/store.ts`、`src/markdown.ts`、`src/projectSend.ts`、`src/fileSend.ts`。

建议后续需求开头使用：

> 请先阅读 `docs/ARCHITECTURE.md`，然后只修改与本次需求相关的最少文件，不要做无关重构。
