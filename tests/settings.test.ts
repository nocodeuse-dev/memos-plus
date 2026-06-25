import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings, restoreSettingsTabsScroll } from "../src/settings";
import { buildEmptyExcalidrawFile, buildExcalidrawAttachmentPath, buildImageAttachmentPath, normalizeImageExtension } from "../src/store";

const settingsSource = readFileSync("src/settings.ts", "utf8");
const stylesSource = readFileSync("styles.css", "utf8");

vi.mock("obsidian", () => ({
  App: class {},
  Modal: class {},
  Notice: class {},
  PluginSettingTab: class {},
  Setting: class {},
  TFile: class {},
  TFolder: class {},
  normalizePath: (value: string) => value.replace(/\/+/g, "/").replace(/\/$/, "")
}));

describe("DEFAULT_SETTINGS", () => {
  it("uses the Memos attachment folder by default", () => {
    expect(DEFAULT_SETTINGS.attachmentFolder).toBe("我的资源/Memos/attachments");
    expect(DEFAULT_SETTINGS.imageHandlingMode).toBe("auto");
    expect(DEFAULT_SETTINGS.composerBorderColor).toBe("#8b5cf6");
    expect(DEFAULT_SETTINGS.composerBackgroundColor).toBe("");
    expect(DEFAULT_SETTINGS.calloutEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.calloutType).toBe("note");
    expect(DEFAULT_SETTINGS.calloutFoldMode).toBe("folded");
    expect(DEFAULT_SETTINGS.calloutTitleMode).toBe("firstLine");
    expect(DEFAULT_SETTINGS.calloutAutoForLongContent).toBe(true);
    expect(DEFAULT_SETTINGS.calloutAutoLength).toBe(300);
    expect(DEFAULT_SETTINGS.calloutAutoLines).toBe(5);
    expect(DEFAULT_SETTINGS.calloutAutoForLinks).toBe(true);
    expect(DEFAULT_SETTINGS.performanceDebugMode).toBe(false);
    expect(DEFAULT_SETTINGS.mobilePerformanceMode).toBe(true);
    expect(DEFAULT_SETTINGS.performanceSafeMode).toBe(false);
    expect(DEFAULT_SETTINGS.mobileLightHomeEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.mobileLightHomeRecentCount).toBe(10);
    expect(DEFAULT_SETTINGS.mobileLightHomeSections.inbox).toEqual({ visible: true, height: 160 });
    expect(DEFAULT_SETTINGS.mobileLightHomeSections.recent).toEqual({ visible: true, height: 280 });
    expect(DEFAULT_SETTINGS.mobileLightHomeShowLaterButton).toBe(true);
    expect(DEFAULT_SETTINGS.mobileHomeLayout).toBe("sidebar-composer");
    expect(DEFAULT_SETTINGS.mobileHomeCustomModules).toMatchObject({
      composer: true,
      sidebar: true,
      memoList: false,
      recent: true,
      organizer: true,
      tasks: true,
      tags: true,
      heatmap: false,
      stats: false,
      search: true,
      refresh: true
    });
    expect(DEFAULT_SETTINGS.homeLayout.mode).toBe("full");
    expect(DEFAULT_SETTINGS.sidebarLayout.mode).toBe("quick-input");
    expect(DEFAULT_SETTINGS.mobileLayout.mode).toBe("navigation");
    expect(DEFAULT_SETTINGS.sendFailureDraftEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.sendFailureDraftContent).toBe("");
    expect(DEFAULT_SETTINGS.composerToolbar).toEqual({
      tag: true,
      image: true,
      unorderedList: true,
      orderedList: true,
      task: true,
      table: true,
      callout: true,
      codeBlock: false,
      excalidraw: false
    });
  });

  it("uses the Memos year-file folder by default", () => {
    expect(DEFAULT_SETTINGS.memoFolderPath).toBe("我的资源/Memos");
  });

  it("normalizes composer appearance colors", () => {
    expect(normalizeSettings({ composerBorderColor: "#ff00aa", composerBackgroundColor: "#202020" }).composerBorderColor).toBe("#ff00aa");
    expect(normalizeSettings({ composerBorderColor: "bad", composerBackgroundColor: "rgb(1,2,3)" }).composerBorderColor).toBe("#8b5cf6");
    expect(normalizeSettings({ composerBorderColor: "bad", composerBackgroundColor: "rgb(1,2,3)" }).composerBackgroundColor).toBe("");
  });

  it("normalizes shared view layout settings for all display surfaces", () => {
    const settings = normalizeSettings({
      homeLayout: { mode: "project" },
      sidebarLayout: { mode: "custom", visibleModules: ["quickInput", "heatmap", "projectDirectory"] },
      mobileLayout: { mode: "minimal" }
    });

    expect(settings.homeLayout.mode).toBe("project");
    expect(settings.sidebarLayout).toEqual({
      mode: "custom",
      visibleModules: ["quickInput", "projectDirectory"],
      order: ["quickInput", "projectDirectory"],
      compactMode: true
    });
    expect(settings.mobileLayout.mode).toBe("minimal");
  });

  it("uses mobileLayout as the canonical mobile layout and migrates legacy mobileHomeLayout only when needed", () => {
    const explicit = normalizeSettings({
      mobileHomeLayout: "minimal",
      mobileLayout: { mode: "task" }
    });
    expect(explicit.mobileHomeLayout).toBe("minimal");
    expect(explicit.mobileLayout.mode).toBe("task");

    const migrated = normalizeSettings({
      mobileHomeLayout: "composer-recent"
    });
    expect(migrated.mobileLayout).toEqual({
      mode: "custom",
      visibleModules: ["quickInput", "inputToolbar", "sendButton", "moreMenu", "fileCount", "fileList"],
      order: ["quickInput", "inputToolbar", "sendButton", "moreMenu", "fileCount", "fileList"],
      compactMode: true
    });

    expect(normalizeSettings({}).mobileLayout).toEqual(DEFAULT_SETTINGS.mobileLayout);
  });


  it("uses list as the default saving prefix", () => {
    expect(DEFAULT_SETTINGS.defaultPrefix).toBe("list");
  });

  it("sends to project by default from the composer send button", () => {
    expect(DEFAULT_SETTINGS.defaultSendAction).toBe("project");
  });

  it("enables bounded link analysis by default", () => {
    expect(DEFAULT_SETTINGS.linkAnalysisEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.linkAnalysisMobileEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.linkAnalysisMaxLinks).toBe(3);
    expect(DEFAULT_SETTINGS.linkAnalysisTimeoutMs).toBe(4500);
  });

  it("keeps the original memo after transferring to a project by default", () => {
    expect(DEFAULT_SETTINGS.memoProjectTransferAfterAction).toBe("keep");
  });

  it("starts with no custom saved searches", () => {
    expect(DEFAULT_SETTINGS.savedSearches).toEqual([]);
  });

  it("starts with no custom sidebar directory items", () => {
    expect(DEFAULT_SETTINGS.allMemosIcon).toBe("layout-grid");
    expect(DEFAULT_SETTINGS.iconOverrides).toEqual({});
    expect(DEFAULT_SETTINGS.sidebarItems).toEqual([]);
  });

  it("shows a bounded directory in the sidebar quick input by default", () => {
    expect(DEFAULT_SETTINGS.quickInputAutoOpen).toBe(true);
    expect(DEFAULT_SETTINGS.quickInputShowDirectory).toBe(true);
    expect(DEFAULT_SETTINGS.quickInputDirectoryLimit).toBe(20);
    expect(DEFAULT_SETTINGS.quickInputDirectoryExpandedLimit).toBe(20);
    expect(DEFAULT_SETTINGS.quickInputDirectoryMobileExpandedLimit).toBe(10);
    expect(DEFAULT_SETTINGS.organizerPanelEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.organizerPanelDefaultCollapsed).toBe(false);
    expect(DEFAULT_SETTINGS.organizerPanelDesktopHeight).toBe(220);
    expect(DEFAULT_SETTINGS.organizerPanelMobileHeight).toBe(160);
    expect(DEFAULT_SETTINGS.organizerPanelSections.inbox.visible).toBe(true);
    expect(DEFAULT_SETTINGS.organizerPanelSections.tasks.mobileHeight).toBe(160);
    expect(DEFAULT_SETTINGS.organizerMemoStates).toEqual({});
    expect(DEFAULT_SETTINGS.organizerTaskPriorityBranchesEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.organizerTaskDateBranchesEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.organizerTasksDefaultExpanded).toBe(false);
    expect(DEFAULT_SETTINGS.taskManagementVisibleItems).toEqual({
      incomplete: true,
      priorityHighest: true,
      priorityHigh: true,
      priorityMedium: true,
      priorityLow: true,
      priorityLowest: true,
      priorityNone: true,
      overdue: true,
      dueToday: true,
      dueThisWeek: true
    });
    expect(DEFAULT_SETTINGS.taskVaultFilterEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.taskIndexEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.taskIndexAutoBuild).toBe(true);
    expect(DEFAULT_SETTINGS.taskIndexDelayOnMobile).toBe(true);
  });

  it("starts with no link capture tags and default project send settings", () => {
    expect(DEFAULT_SETTINGS.linkCaptureDefaultTags).toEqual([]);
    expect(DEFAULT_SETTINGS.projectTag).toBe("项目");
    expect(DEFAULT_SETTINGS.projectFolderPath).toBe("项目");
    expect(DEFAULT_SETTINGS.defaultProjectSection).toBe("收集箱");
    expect(DEFAULT_SETTINGS.showArchivedProjects).toBe(false);
    expect(DEFAULT_SETTINGS.projectSections).toEqual(["收集箱", "待办", "资料", "想法", "问题", "日志", "已完成"]);
    expect(DEFAULT_SETTINGS.recentProjectPaths).toEqual([]);
    expect(DEFAULT_SETTINGS.sendToFileEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.sendToFileDefaultTag).toBe("");
    expect(DEFAULT_SETTINGS.sendToFileCommonTags).toEqual(["病", "插件", "病例", "医学", "康复", "资料"]);
    expect(DEFAULT_SETTINGS.projectSendTagTabs).toEqual([]);
    expect(DEFAULT_SETTINGS.projectSendTabOrder).toEqual(["search"]);
    expect(DEFAULT_SETTINGS.projectSendHiddenTabs).toEqual([]);
    expect(DEFAULT_SETTINGS.managedTemplates).toEqual([]);
    expect(DEFAULT_SETTINGS.openTargetFileAfterSend).toBe(false);
    expect(DEFAULT_SETTINGS.fileTemplateLibraryFolder).toBe("我的资源/模板");
    expect(DEFAULT_SETTINGS.fileTemplateLibraryDefaultFolder).toBe("我的资源/Memos");
    expect(DEFAULT_SETTINGS.fileTemplateLibraryFavorites).toEqual([]);
    expect(DEFAULT_SETTINGS.fileTemplateLibraryRecent).toEqual([]);
    expect(DEFAULT_SETTINGS.fileTemplateLibraryDefaults).toEqual({});
    expect(DEFAULT_SETTINGS.fileTemplateLibraryDefaultTabId).toBe("all");
    expect(DEFAULT_SETTINGS.fileTemplateLibraryTabOrder).toEqual([]);
    expect(DEFAULT_SETTINGS.fileTemplateLibraryInteraction).toEqual({
      enableDesktopTabDrag: true,
      enableMobileTabDrag: false
    });
    expect(DEFAULT_SETTINGS.fileTemplateTabs).toEqual([]);
    expect(DEFAULT_SETTINGS.fileTemplateTabInteraction).toEqual({
      enableDesktopDrag: true,
      enableMobileDrag: false,
      enableMobileReorder: false,
      mobileReadOnly: true
    });
    expect(DEFAULT_SETTINGS.sendToFileDefaultInsertPosition).toBe("heading-top");
    expect(DEFAULT_SETTINGS.sendToFileNoHeadingBehavior).toBe("ask");
    expect(DEFAULT_SETTINGS.recentFileTargetPaths).toEqual([]);
    expect(DEFAULT_SETTINGS.tasksFormatEnabled).toBe(true);
    expect(DEFAULT_SETTINGS.taskDefaultSection).toBe("待办");
    expect(DEFAULT_SETTINGS.taskAddCreatedDate).toBe(true);
    expect(DEFAULT_SETTINGS.taskAddProjectTag).toBe(true);
    expect(DEFAULT_SETTINGS.taskDefaultPriority).toBe("medium");
    expect(DEFAULT_SETTINGS.taskDefaultDueDate).toBe("");
    expect(DEFAULT_SETTINGS.taskDefaultScheduledDate).toBe("");
    expect(DEFAULT_SETTINGS.taskDefaultRecurrence).toBe("none");
    expect(DEFAULT_SETTINGS.taskPromptOnCreate).toBe(true);
  });
});

describe("settings tab scroll behavior", () => {
  it("restores the tab bar scroll position and leaves visible active tabs alone", () => {
    const activeTab = {
      getBoundingClientRect: () => ({ left: 140, right: 220 }),
      scrollIntoView: vi.fn()
    };
    const tabBar = {
      scrollLeft: 0,
      getBoundingClientRect: () => ({ left: 100, right: 320 })
    };

    restoreSettingsTabsScroll(tabBar, 180, activeTab);

    expect(tabBar.scrollLeft).toBe(180);
    expect(activeTab.scrollIntoView).not.toHaveBeenCalled();
  });

  it("uses nearest scrollIntoView only when the active tab is outside the visible range", () => {
    const activeTab = {
      getBoundingClientRect: () => ({ left: 360, right: 460 }),
      scrollIntoView: vi.fn()
    };
    const tabBar = {
      scrollLeft: 0,
      getBoundingClientRect: () => ({ left: 100, right: 320 })
    };

    restoreSettingsTabsScroll(tabBar, 180, activeTab);

    expect(tabBar.scrollLeft).toBe(180);
    expect(activeTab.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });
});

describe("normalizeSettings", () => {
  it("normalizes organizer panel settings and states for old users", () => {
    const settings = normalizeSettings({
      organizerPanelEnabled: false,
      organizerPanelDefaultCollapsed: true,
      organizerPanelDesktopHeight: 999,
      organizerPanelMobileHeight: 10,
      organizerPanelSections: {
        inbox: { visible: false, desktopHeight: 120, mobileHeight: 90 },
        links: { visible: true, desktopHeight: 300 }
      },
      organizerTaskPriorityBranchesEnabled: false,
      organizerTaskDateBranchesEnabled: false,
      organizerTasksDefaultExpanded: true,
      taskManagementVisibleItems: {
        priorityHighest: false,
        overdue: false
      },
      taskVaultFilterEnabled: false,
      taskIndexEnabled: false,
      taskIndexAutoBuild: false,
      taskIndexDelayOnMobile: false,
      organizerMemoStates: {
        memo: {
          organized: true,
          organizedAt: "2026-06-19T08:00:00.000Z",
          lastAction: "organized",
          targetPath: "我的资源/Memos/memos plus.md"
        },
        broken: {}
      }
    });

    expect(settings.organizerPanelEnabled).toBe(false);
    expect(settings.organizerPanelDefaultCollapsed).toBe(true);
    expect(settings.organizerPanelDesktopHeight).toBe(480);
    expect(settings.organizerPanelMobileHeight).toBe(80);
    expect(settings.organizerPanelSections.inbox).toEqual({ visible: false, desktopHeight: 120, mobileHeight: 90 });
    expect(settings.organizerPanelSections.links).toEqual({ visible: true, desktopHeight: 300, mobileHeight: 160 });
    expect(settings.organizerPanelSections.tasks.visible).toBe(true);
    expect(settings.organizerTaskPriorityBranchesEnabled).toBe(false);
    expect(settings.organizerTaskDateBranchesEnabled).toBe(false);
    expect(settings.organizerTasksDefaultExpanded).toBe(true);
    expect(settings.taskManagementVisibleItems.priorityHighest).toBe(false);
    expect(settings.taskManagementVisibleItems.overdue).toBe(false);
    expect(settings.taskManagementVisibleItems.priorityHigh).toBe(true);
    expect(settings.taskVaultFilterEnabled).toBe(false);
    expect(settings.taskIndexEnabled).toBe(false);
    expect(settings.taskIndexAutoBuild).toBe(false);
    expect(settings.taskIndexDelayOnMobile).toBe(false);
    expect(settings.organizerMemoStates).toEqual({
      memo: {
        organized: true,
        organizedAt: "2026-06-19T08:00:00.000Z",
        lastAction: "organized",
        targetPath: "我的资源/Memos/memos plus.md"
      }
    });
  });

  it("normalizes mobile light home settings", () => {
    const settings = normalizeSettings({
      mobileLightHomeEnabled: false,
      mobileLightHomeRecentCount: 88,
      mobileLightHomeSections: {
        inbox: { visible: false, height: 80 },
        recent: { visible: true, height: 999 }
      },
      mobileLightHomeShowLaterButton: false,
      mobileHomeLayout: "custom",
      mobileHomeCustomModules: {
        composer: false,
        sidebar: true,
        memoList: false,
        stats: false,
        bogus: true
      }
    });

    expect(settings.mobileLightHomeEnabled).toBe(false);
    expect(settings.mobileLightHomeRecentCount).toBe(30);
    expect(settings.mobileLightHomeSections.inbox).toEqual({ visible: false, height: 96 });
    expect(settings.mobileLightHomeSections.recent).toEqual({ visible: true, height: 360 });
    expect(settings.mobileLightHomeShowLaterButton).toBe(false);
    expect(settings.mobileHomeLayout).toBe("custom");
    expect(settings.mobileHomeCustomModules.composer).toBe(false);
    expect(settings.mobileHomeCustomModules.sidebar).toBe(true);
    expect(settings.mobileHomeCustomModules.memoList).toBe(false);
    expect(settings.mobileHomeCustomModules.stats).toBe(false);
    expect(settings.mobileHomeCustomModules.recent).toBe(true);
    expect(normalizeSettings({ mobileHomeLayout: "bad" }).mobileHomeLayout).toBe("sidebar-composer");
  });

  it("normalizes send failure draft recovery settings", () => {
    const settings = normalizeSettings({
      sendFailureDraftEnabled: false,
      sendFailureDraftContent: 123
    });

    expect(settings.sendFailureDraftEnabled).toBe(false);
    expect(settings.sendFailureDraftContent).toBe("");
  });

  it("fills missing saved searches and keeps valid saved searches", () => {
    expect(normalizeSettings({}).savedSearches).toEqual([]);
    expect(
      normalizeSettings({
        savedSearches: [
          {
            id: "tasks",
            name: "未完成任务",
            match: "all",
            conditions: [{ field: "task", operator: "exists" }]
          },
          { id: "bad", name: "Bad", match: "all", conditions: [{ field: "unknown", operator: "exists" }] }
        ]
      }).savedSearches
    ).toEqual([
      {
        id: "tasks",
        name: "未完成任务",
        match: "all",
        searchScope: "memos",
        conditions: [{ field: "task", operator: "exists" }]
      }
    ]);
  });

  it("migrates legacy saved searches into a default sidebar group", () => {
    expect(
      normalizeSettings({
        savedSearches: [
          {
            id: "tasks",
            name: "未完成任务",
            match: "all",
            conditions: [{ field: "task", operator: "exists" }]
          }
        ]
      }).sidebarItems
    ).toEqual([
      {
        id: "default-searches",
        type: "group",
        title: "检索式",
        icon: "folder",
        collapsed: false,
        children: [{ id: "item-tasks", type: "search", title: "未完成任务", icon: "filter", searchId: "tasks" }]
      }
    ]);
  });

  it("normalizes link capture tags", () => {
    expect(
      normalizeSettings({
        linkCaptureDefaultTags: ["#链接", " 项目/AI ", "", "##资料"]
      })
    ).toMatchObject({
      linkCaptureDefaultTags: ["链接", "项目/AI", "资料"]
    });
  });

  it("normalizes image handling mode", () => {
    expect(normalizeSettings({}).imageHandlingMode).toBe("auto");
    expect(normalizeSettings({ imageHandlingMode: "memos" }).imageHandlingMode).toBe("memos");
    expect(normalizeSettings({ imageHandlingMode: "image-auto-upload" }).imageHandlingMode).toBe("image-auto-upload");
    expect(normalizeSettings({ imageHandlingMode: "unknown" }).imageHandlingMode).toBe("auto");
  });

  it("normalizes composer toolbar visibility without breaking old settings", () => {
    expect(normalizeSettings({}).composerToolbar).toEqual(DEFAULT_SETTINGS.composerToolbar);
    expect(
      normalizeSettings({
        composerToolbar: {
          tag: false,
          codeBlock: true,
          excalidraw: true,
          unknown: false
        }
      }).composerToolbar
    ).toEqual({
      ...DEFAULT_SETTINGS.composerToolbar,
      tag: false,
      codeBlock: true,
      excalidraw: true
    });
  });

  it("normalizes the default send action", () => {
    expect(normalizeSettings({}).defaultSendAction).toBe("project");
    expect(normalizeSettings({ defaultSendAction: "memo" }).defaultSendAction).toBe("memo");
    expect(normalizeSettings({ defaultSendAction: "project" }).defaultSendAction).toBe("project");
    expect(normalizeSettings({ defaultSendAction: "ask" }).defaultSendAction).toBe("ask");
    expect(normalizeSettings({ defaultSendAction: "unknown" }).defaultSendAction).toBe("project");
  });

  it("normalizes the memo project transfer after-action", () => {
    expect(normalizeSettings({}).memoProjectTransferAfterAction).toBe("keep");
    expect(normalizeSettings({ memoProjectTransferAfterAction: "keep" }).memoProjectTransferAfterAction).toBe("keep");
    expect(normalizeSettings({ memoProjectTransferAfterAction: "archive" }).memoProjectTransferAfterAction).toBe("archive");
    expect(normalizeSettings({ memoProjectTransferAfterAction: "delete" }).memoProjectTransferAfterAction).toBe("delete");
    expect(normalizeSettings({ memoProjectTransferAfterAction: "unknown" }).memoProjectTransferAfterAction).toBe("keep");
  });

  it("does not persist a default project format rule when only legacy destination settings exist", () => {
    const settings = normalizeSettings({
      projectTag: " #项目 ",
      projectFolderPath: " Projects//Active ",
      defaultProjectSection: " 资料 ",
      clearAfterSave: false,
      memoProjectTransferAfterAction: "archive"
    });

    expect(settings.managedTemplates).toEqual([]);
  });

  it("does not resurrect a deleted project format rule when custom rules exist", () => {
    const settings = normalizeSettings({
      projectTag: " #项目 ",
      projectFolderPath: " Projects//Active ",
      defaultProjectSection: " 资料 ",
      managedTemplates: [
        {
          id: "new-file",
          name: "新建病例",
          targetSource: "new-file",
          folderPath: " 医学//病例 ",
          defaultTags: ["病例"]
        }
      ]
    });

    expect(settings.managedTemplates).toEqual([
      expect.objectContaining({
        id: "new-file",
        name: "新建病例",
        targetSource: "new-file",
        folderPath: "医学/病例"
      })
    ]);
  });

  it("normalizes callout settings", () => {
    expect(
      normalizeSettings({
        calloutEnabled: false,
        calloutType: "warning",
        calloutFoldMode: "expanded",
        calloutTitleMode: "custom",
        calloutTitleTemplate: "{project} - {date}",
        calloutAutoForLongContent: false,
        calloutAutoLength: 120,
        calloutAutoLines: 3,
        calloutAutoForLinks: false
      })
    ).toMatchObject({
      calloutEnabled: false,
      calloutType: "warning",
      calloutFoldMode: "expanded",
      calloutTitleMode: "custom",
      calloutTitleTemplate: "{project} - {date}",
      calloutAutoForLongContent: false,
      calloutAutoLength: 120,
      calloutAutoLines: 3,
      calloutAutoForLinks: false
    });

    expect(
      normalizeSettings({
        calloutType: "unknown",
        calloutFoldMode: "bad",
        calloutTitleMode: "bad",
        calloutAutoLength: -1,
        calloutAutoLines: 0
      })
    ).toMatchObject({
      calloutType: "note",
      calloutFoldMode: "folded",
      calloutTitleMode: "firstLine",
      calloutAutoLength: 300,
      calloutAutoLines: 5
    });
  });

  it("keeps a configurable icon for the fixed all-memos entry", () => {
    expect(normalizeSettings({}).allMemosIcon).toBe("layout-grid");
    expect(normalizeSettings({ allMemosIcon: " book-open " }).allMemosIcon).toBe("book-open");
    expect(
      normalizeSettings({
        iconOverrides: {
          "filter-important": { type: "emoji", value: "⭐" },
          "task-due-today": { type: "lucide", value: "calendar-check" },
          "bad-svg": { type: "svg", value: "<svg />" }
        }
      }).iconOverrides
    ).toEqual({
      "filter-important": { type: "emoji", value: "⭐" },
      "task-due-today": { type: "lucide", value: "calendar-check" }
    });
  });

  it("normalizes send-to-project settings", () => {
    expect(
      normalizeSettings({
        projectTag: " #项目 ",
        projectFolderPath: " Projects//Active ",
        defaultProjectSection: " 资料 ",
        showArchivedProjects: true,
        projectSections: " 收集箱\n待办\n\n资料\n资料 ",
        recentProjectPaths: [" Projects//A.md ", "", "Projects/B.md"],
        sendToFileEnabled: false,
        sendToFileDefaultTag: " 病 ",
        sendToFileCommonTags: ["#病", " 插件 ", "", "#医学/疾病"],
        projectSendTagTabs: ["#病", " 插件 ", "", "#病", "#医学/疾病"],
        projectSendTabOrder: ["search", "custom:插件", "project", "bad", "tag", "search"],
        projectSendHiddenTabs: ["recent", "custom:医学/疾病", "bad", "recent"],
        managedTemplates: [{ id: "tpl", name: " 病例 ", type: "case", folderPath: " 医学//病例 ", defaultTags: ["#病例"] }],
        openTargetFileAfterSend: true,
      sendToFileDefaultInsertPosition: "file-end",
      sendToFileNoHeadingBehavior: "file-start",
      recentFileTargetPaths: [" 医学//肩袖损伤.md ", "", "插件/Memos Plus.md"],
      fileTemplateLibraryFolder: " 我的资源//模板 ",
      fileTemplateLibraryDefaultFolder: " 我的资源//疾病 ",
      fileTemplateLibraryFavorites: [" 我的资源//模板/疾病.md ", "", "我的资源/模板/疾病.md"],
      fileTemplateLibraryRecent: [" 我的资源//模板/项目.md ", "我的资源/模板/疾病.md"],
        fileTemplateLibraryDefaults: {
          " #病 ": " 我的资源//模板/疾病.md ",
          "": "bad.md",
          项目: ""
        },
        fileTemplateLibraryDefaultTabId: " category:病历 ",
        fileTemplateLibraryTabOrder: ["category:病历", "recent", "bad", "all", "custom:group-common", "recent", "custom:tag-medical"],
        fileTemplateLibraryInteraction: {
          enableDesktopTabDrag: false,
          enableMobileTabDrag: true
        },
        fileTemplateTabs: [
          { id: " tag-medical ", name: " 病 ", type: "tag-filter", tags: ["#病", "医学", "#病"] },
          { id: "group-common", name: " 常用模板 ", type: "template-group", templatePaths: [" 我的资源//模板/项目模板.md ", ""] }
        ],
        fileTemplateTabInteraction: {
          enableDesktopDrag: false,
          enableMobileDrag: true,
          enableMobileReorder: true,
          mobileReadOnly: false
        }
    })
  ).toMatchObject({
      projectTag: "项目",
      projectFolderPath: "Projects/Active",
      defaultProjectSection: "资料",
      showArchivedProjects: true,
      projectSections: ["收集箱", "待办", "资料"],
      recentProjectPaths: ["Projects/A.md", "Projects/B.md"],
      sendToFileEnabled: false,
      sendToFileDefaultTag: "病",
      sendToFileCommonTags: ["病", "插件", "医学/疾病"],
      projectSendTagTabs: ["病", "插件", "医学/疾病"],
      projectSendTabOrder: ["search", "custom:tag-medical", "custom:group-common"],
      projectSendHiddenTabs: [],
      managedTemplates: [
        expect.objectContaining({
          id: "tpl",
          name: "病例",
          type: "case",
          targetSource: "new-file",
          folderPath: "医学/病例",
          defaultTags: ["病例"],
          insertLocation: "heading",
          insertFormat: "note",
          clearAfterSendMode: "global",
          clearAfterSend: true,
          afterTransferActionMode: "global",
          afterTransferAction: "keep"
        })
      ],
      openTargetFileAfterSend: true,
      sendToFileDefaultInsertPosition: "file-end",
      sendToFileNoHeadingBehavior: "file-start",
      recentFileTargetPaths: ["医学/肩袖损伤.md", "插件/Memos Plus.md"],
      fileTemplateLibraryFolder: "我的资源/模板",
      fileTemplateLibraryDefaultFolder: "我的资源/疾病",
      fileTemplateLibraryFavorites: ["我的资源/模板/疾病.md"],
      fileTemplateLibraryRecent: ["我的资源/模板/项目.md", "我的资源/模板/疾病.md"],
      fileTemplateLibraryDefaults: {
        病: "我的资源/模板/疾病.md"
      },
      fileTemplateLibraryDefaultTabId: "all",
      fileTemplateLibraryTabOrder: ["all", "custom:group-common"],
      fileTemplateLibraryInteraction: {
        enableDesktopTabDrag: false,
        enableMobileTabDrag: true
      },
      fileTemplateTabs: [
        { id: "tag-medical", name: "病", type: "tag-filter", tags: ["病", "医学"], templatePaths: [] },
        { id: "group-common", name: "常用模板", type: "template-group", tags: [], templatePaths: ["我的资源/模板/项目模板.md"] }
      ],
      fileTemplateTabInteraction: {
        enableDesktopDrag: false,
        enableMobileDrag: true,
        enableMobileReorder: true,
        mobileReadOnly: false
      }
    });
  });

  it("normalizes template library defaults to all plus template groups only", () => {
    const settings = normalizeSettings({
      fileTemplateLibraryDefaultTabId: "custom:tag-medical",
      fileTemplateLibraryTabOrder: ["favorite", "custom:tag-medical", "custom:group-common", "category:未分类", "recent"],
      fileTemplateTabs: [
        { id: "tag-medical", name: "病历", type: "tag-filter", tags: ["#病历"] },
        { id: "group-common", name: "常用模板", type: "template-group", templatePaths: ["我的资源/模板/项目模板.md"] }
      ]
    });

    expect(settings.fileTemplateLibraryDefaultTabId).toBe("all");
    expect(settings.fileTemplateLibraryTabOrder).toEqual(["all", "custom:group-common"]);
    expect(settings.fileTemplateTabs).toEqual([
      { id: "tag-medical", name: "病历", type: "tag-filter", tags: ["病历"], templatePaths: [] },
      { id: "group-common", name: "常用模板", type: "template-group", tags: [], templatePaths: ["我的资源/模板/项目模板.md"] }
    ]);
  });

  it("renders template library settings as template-group management only", () => {
    const source = settingsSource.slice(
      settingsSource.indexOf("private renderFileTemplateLibrarySettings"),
      settingsSource.indexOf("private openManagedTemplateModal")
    );

    expect(source).toContain("settings.fileTemplateLibraryDefaultTab");
    expect(source).toContain("this.fileTemplateLibraryDefaultTabOptions()");
    expect(source).toContain("createTemplateGroupFileTemplateTab");
    expect(source).toContain("normalizeVisibleFileTemplateLibraryDefaultTabId");
    expect(source).toContain("settings.fileTemplateTabInteraction");
    expect(source).toContain("this.renderFileTemplateTabInteractionSettings(container)");
    expect(source).toContain("renderFileTemplateGroupSearch");
    expect(source).toContain("settings.fileTemplateTabTemplateSearch");
    expect(source).toContain("请先设置模板库位置");
    expect(source).toContain("this.plugin.store.getFileTemplateLibraryItems()");
    expect(source).toContain("if (!normalizedQuery) {");
    expect(source).toContain("return;");
    expect(source).toContain("slice(0, 10)");
    expect(source).toContain("settings.fileTemplateTabTemplateSearchMore");
    expect(source).not.toContain('renderFileTemplateGroupSearchResults(results, tab, "")');
    expect(source).not.toContain("return true;");
    expect(source).toContain("const nextPaths = [...targetTab.templatePaths, normalizedPath]");
    expect(source).toContain("templatePaths: item.id === tabId ? nextPaths : item.templatePaths");
    expect(source).toContain("removeTemplatePathFromGroup");
    expect(source).not.toContain("settings.fileTemplateTabType.tag-filter");
    expect(source).not.toContain("convertFileTemplateTabType");
    expect(source).toContain("enableDesktopDrag");
    expect(source).toContain("enableMobileDrag");
    expect(source).not.toContain("settings.fileTemplateLibraryTabMobileDrag");
    expect(stylesSource).toContain("max-height: 240px");
    expect(stylesSource).toContain("overflow-y: auto");
  });

  it("migrates legacy project send custom tags into tag-filter template tabs", () => {
    const settings = normalizeSettings({
      projectSendTagTabs: ["#病", "插件"],
      projectSendTabOrder: ["search", "custom:插件", "project"]
    });

    expect(settings.fileTemplateTabs).toEqual([
      { id: "病", name: "病", type: "tag-filter", tags: ["病"], templatePaths: [] },
      { id: "插件", name: "插件", type: "tag-filter", tags: ["插件"], templatePaths: [] }
    ]);
    expect(settings.projectSendTabOrder).toEqual(["search", "custom:插件", "custom:病"]);
  });

  it("ignores removed legacy project template fields without creating a stored format rule", () => {
    const settings = normalizeSettings({
      projectInsertHeading: "旧标题",
      createProjectHeadingIfMissing: false,
      projectTemplateOptions: {
        format: "task",
        taskAddCreatedDate: true
      },
      projectInsertTemplate: "- {{content}}\n  - 时间：{{time}}"
    });
    const record = settings as unknown as Record<string, unknown>;

    expect(record.projectInsertHeading).toBeUndefined();
    expect(record.createProjectHeadingIfMissing).toBeUndefined();
    expect(record.projectTemplateOptions).toBeUndefined();
    expect(record.projectInsertTemplate).toBeUndefined();
    expect(settings.managedTemplates).toEqual([]);
  });

  it("normalizes Tasks compatibility settings", () => {
    expect(
      normalizeSettings({
        tasksFormatEnabled: false,
        taskDefaultSection: " 任务 ",
        taskAddCreatedDate: false,
        taskAddProjectTag: false,
        taskDefaultPriority: "最高",
        taskDefaultDueDate: "2026-06-20",
        taskDefaultScheduledDate: "bad-date",
        taskDefaultRecurrence: "每周",
        taskPromptOnCreate: false,
        projectSections: ["收集箱", "待办"]
      })
    ).toMatchObject({
      tasksFormatEnabled: false,
      taskDefaultSection: "任务",
      taskAddCreatedDate: false,
      taskAddProjectTag: false,
      taskDefaultPriority: "highest",
      taskDefaultDueDate: "2026-06-20",
      taskDefaultScheduledDate: "",
      taskDefaultRecurrence: "weekly",
      taskPromptOnCreate: false,
      projectSections: ["任务", "收集箱", "待办"]
    });

    expect(
      normalizeSettings({
        taskDefaultPriority: "unknown",
        taskDefaultDueDate: "not-a-date",
        taskDefaultRecurrence: "unknown"
      })
    ).toMatchObject({
      taskDefaultPriority: "medium",
      taskDefaultDueDate: "",
      taskDefaultRecurrence: "none"
    });
    expect(normalizeSettings({}).taskPromptOnCreate).toBe(true);
  });
});

describe("image attachment path helpers", () => {
  it("builds a vault-relative path with a sanitized extension", () => {
    expect(buildImageAttachmentPath("Memos/attachments", ".JPG", new Date(2026, 5, 13, 5, 10, 9), "abcd")).toBe(
      "Memos/attachments/memos-plus-20260613-051009-abcd.jpg"
    );
  });

  it("falls back to png for unsafe extensions", () => {
    expect(normalizeImageExtension("../weird")).toBe("png");
  });

  it("builds a unique Excalidraw markdown path", () => {
    expect(buildExcalidrawAttachmentPath("我的资源/附件", new Date(2026, 5, 15, 9, 8, 7), "abcd")).toBe(
      "我的资源/附件/memos-plus-20260615-090807-abcd.excalidraw.md"
    );
  });

  it("builds an empty Excalidraw markdown file", () => {
    const source = buildEmptyExcalidrawFile();
    expect(source).toContain("excalidraw-plugin: parsed");
    expect(source).toContain("tags: [excalidraw]");
    expect(source).toContain("```compressed-json");
  });
});
