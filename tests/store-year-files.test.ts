import { describe, expect, it, vi } from "vitest";
import { TFile, TFolder } from "obsidian";
import { MemosPlusStore } from "../src/store";
import { DEFAULT_SETTINGS } from "../src/settings";

vi.mock("obsidian", () => {
  class TFile {
    basename: string;
    extension = "md";
    stat = { mtime: 0 };

    constructor(readonly path: string, readonly name = path.split("/").pop() ?? path) {
      this.basename = name.replace(/\.md$/i, "");
    }
  }
  class TFolder {
    constructor(readonly path: string, readonly name = path.split("/").pop() ?? path) {}
  }
  return {
    App: class {},
    Modal: class {},
    Notice: class {},
    PluginSettingTab: class {},
    Setting: class {},
    TFile,
    TFolder,
    normalizePath: (value: string) => value.replace(/\/+/g, "/").replace(/\/$/, "")
  };
});

interface MemoryFile {
  path: string;
  name: string;
  content: string;
}

function createApp(initialFiles: Record<string, string>) {
  const files = new Map<string, MemoryFile>();
  const folders = new Set<string>();
  const processed: string[] = [];

  for (const [path, content] of Object.entries(initialFiles)) {
    files.set(path, { path, name: path.split("/").pop() ?? path, content });
    addParentFolders(path, folders);
  }

  const app = {
    vault: {
      getAbstractFileByPath: vi.fn((path: string) => {
        if (files.has(path)) {
          const file = files.get(path)!;
          return makeTFile(file.path, file.name);
        }
        if (folders.has(path)) {
          return makeTFolder(path);
        }
        return null;
      }),
      getFiles: vi.fn(() => Array.from(files.values()).map((file) => makeTFile(file.path, file.name))),
      read: vi.fn(async (file: TFile) => files.get(file.path)?.content ?? ""),
      create: vi.fn(async (path: string, content: string) => {
        files.set(path, { path, name: path.split("/").pop() ?? path, content });
        addParentFolders(path, folders);
        return makeTFile(path);
      }),
      modify: vi.fn(async (file: TFile, content: string) => {
        files.set(file.path, { path: file.path, name: file.name, content });
      }),
      process: vi.fn(async (file: TFile, updater: (source: string) => string) => {
        processed.push(file.path);
        const current = files.get(file.path)?.content ?? "";
        files.set(file.path, { path: file.path, name: file.name, content: updater(current) });
      }),
      createFolder: vi.fn(async (path: string) => {
        folders.add(path);
      })
    },
    metadataCache: {
      getFileCache: vi.fn(() => null)
    },
    workspace: {
      getLeaf: vi.fn(() => ({
        openFile: vi.fn()
      }))
    }
  };

  return { app, files, processed };
}

function makeTFile(path: string, name = path.split("/").pop() ?? path): TFile {
  const FileCtor = TFile as unknown as new (path: string, name?: string) => TFile;
  return new FileCtor(path, name);
}

function makeTFolder(path: string): TFolder {
  const FolderCtor = TFolder as unknown as new (path: string) => TFolder;
  return new FolderCtor(path);
}

function addParentFolders(path: string, folders: Set<string>): void {
  const parts = path.split("/").slice(0, -1);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    folders.add(current);
  }
}

function createStore(initialFiles: Record<string, string>, settings: Partial<typeof DEFAULT_SETTINGS> = {}) {
  const memory = createApp(initialFiles);
  const store = new MemosPlusStore(memory.app as never, () => ({
    ...DEFAULT_SETTINGS,
    memoFolderPath: "我的资源/Memos",
    ...settings
  }));
  return { store, ...memory };
}

describe("MemosPlusStore year files", () => {
  it("reads only direct YYYY.md files from the memo folder", async () => {
    const { store } = createStore({
      "我的资源/Memos/2025.md": "# 2025\n\n## 2025-06\n\n### 2025-06-01 周日\n\n- 2025-06-01 08:00\n  old\n",
      "我的资源/Memos/2026.md": "# 2026\n\n## 2026-06\n\n### 2026-06-13 周六\n\n- 2026-06-13 09:00\n  new\n",
      "我的资源/Memos/memos.md": "# 2026\n\n## 2026-06\n\n### 2026-06-13 周六\n\n- 2026-06-13 10:00\n  ignored\n",
      "我的资源/Memos/nested/2024.md": "# 2024\n\n## 2024-01\n\n### 2024-01-01 周一\n\n- 2024-01-01 10:00\n  nested ignored\n"
    });

    const doc = await store.readDocument();

    expect(doc.memos.map((memo) => memo.content)).toEqual(["old", "new"]);
    expect(doc.memos.map((memo) => memo.filePath)).toEqual(["我的资源/Memos/2025.md", "我的资源/Memos/2026.md"]);
  });

  it("writes new memos to the YYYY.md file for the memo date", async () => {
    const { store, files } = createStore({});

    await store.addMemo("年度文件测试", new Date(2026, 5, 13, 12, 30));
    await store.addMemo("下一年测试", new Date(2027, 0, 2, 8, 5));

    expect(files.get("我的资源/Memos/2026.md")?.content).toContain("- 2026-06-13 12:30\n  - 年度文件测试");
    expect(files.get("我的资源/Memos/2027.md")?.content).toContain("- 2027-01-02 08:05\n  - 下一年测试");
    expect(files.has("Memos/memos.md")).toBe(false);
  });

  it("can write preformatted callout memos without adding the default prefix", async () => {
    const { store, files } = createStore({});

    await store.addMemo("> [!note]- 标题\n> 长内容", new Date(2026, 5, 13, 12, 30), { preformatted: true });

    expect(files.get("我的资源/Memos/2026.md")?.content).toContain("- 2026-06-13 12:30\n  > [!note]- 标题\n  > 长内容");
    expect(files.get("我的资源/Memos/2026.md")?.content).not.toContain("- > [!note]- 标题");
  });

  it("uses Templater to render new file library templates when the plugin is enabled", async () => {
    const { store, files, app } = createStore({
      "我的资源/模板/Templater.md": "# <% tp.file.title %>\n\n{{content}}\n"
    });
    const parseTemplate = vi.fn(async (config: { target_file: TFile }, source: string) => source.replace("<% tp.file.title %>", config.target_file.basename));
    Object.assign(app, {
      plugins: {
        enabledPlugins: new Set(["templater-obsidian"]),
        plugins: {
          "templater-obsidian": {
            templater: {
              create_running_config: (templateFile: TFile, targetFile: TFile, runMode: number) => ({
                template_file: templateFile,
                target_file: targetFile,
                run_mode: runMode
              }),
              parse_template: parseTemplate
            }
          }
        }
      }
    });

    await store.createFileFromLibraryTemplate("我的资源/模板/Templater.md", "今日记录", { content: "正文" });

    expect(parseTemplate).toHaveBeenCalledWith(expect.objectContaining({ target_file: expect.objectContaining({ basename: "今日记录" }) }), "# <% tp.file.title %>\n\n正文\n");
    expect(files.get("我的资源/Memos/今日记录.md")?.content).toBe("# 今日记录\n\n正文\n");
  });

  it("falls back to Memos Plus template variables when Templater rendering fails", async () => {
    const { store, files, app } = createStore({
      "我的资源/模板/Templater.md": "# {{title}}\n\n{{content}}\n"
    });
    Object.assign(app, {
      plugins: {
        enabledPlugins: new Set(["templater-obsidian"]),
        plugins: {
          "templater-obsidian": {
            templater: {
              parse_template: vi.fn(async () => {
                throw new Error("Templater failed");
              })
            }
          }
        }
      }
    });

    await store.createFileFromLibraryTemplate("我的资源/模板/Templater.md", "回退测试", { content: "正文" });

    expect(files.get("我的资源/Memos/回退测试.md")?.content).toBe("# 回退测试\n\n正文\n");
  });

  it("writes new memos to a configured project file using the Memos block format", async () => {
    const { store, files } = createStore({});

    await store.addMemoToFile("Projects/A.md", "[Example](https://example.com) #项目/A", new Date(2026, 5, 13, 12, 30));

    expect(files.get("Projects/A.md")?.content).toContain("- 2026-06-13 12:30\n  - [Example](https://example.com) #项目/A");
  });

  it("appends a captured link as a plain list item to an existing file", async () => {
    const { store, files } = createStore({
      "Projects/A.md": "# Project A\n\nExisting line\n"
    });

    await store.addListItemToFile("Projects/A.md", "[Example](https://example.com)");

    expect(files.get("Projects/A.md")?.content).toBe("# Project A\n\nExisting line\n\n- [Example](https://example.com)\n");
  });

  it("creates a file when appending a captured link as a plain list item", async () => {
    const { store, files } = createStore({});

    await store.addListItemToFile("Projects/New.md", "[Example](https://example.com)");

    expect(files.get("Projects/New.md")?.content).toBe("- [Example](https://example.com)\n");
  });

  it("creates a tagged project file with the configured section structure", async () => {
    const { store, files } = createStore(
      {},
      {
        projectFolderPath: "项目",
        projectTag: "项目",
        projectSections: ["收集箱", "待办", "资料"]
      }
    );

    const file = await store.createProject("Memos Plus/插件开发");

    expect(file.path).toBe("项目/Memos Plus 插件开发.md");
    expect(files.get("项目/Memos Plus 插件开发.md")?.content).toBe(
      ["---", "tags:", "  - 项目", "status: 进行中", "---", "", "# Memos Plus 插件开发", "", "## 收集箱", "", "## 待办", "", "## 资料", ""].join("\n")
    );
  });

  it("creates an Excalidraw file in the configured attachment folder", async () => {
    const { store, files } = createStore({}, { attachmentFolder: "我的资源/附件" });

    const file = await store.createExcalidrawAttachment(new Date(2026, 5, 15, 9, 8, 7), "abcd");

    expect(file.path).toBe("我的资源/附件/memos-plus-20260615-090807-abcd.excalidraw.md");
    expect(files.get(file.path)?.content).toContain("excalidraw-plugin: parsed");
    expect(files.get(file.path)?.content).toContain("```compressed-json");
  });

  it("sends content to the selected project section", async () => {
    const { store, files } = createStore({
      "项目/A.md": "# A\n\n## 资料\n\n旧资料\n"
    });
    const file = makeTFile("项目/A.md");

    await store.sendToProjectFile(file, "新资料", "资料");

    expect(files.get("项目/A.md")?.content).toContain("## 资料\n\n- 新资料\n  - 时间：");
    expect(files.get("项目/A.md")?.content).toContain("\n\n旧资料\n");
  });

  it("can send preformatted callout content to the selected project section without applying the project template", async () => {
    const { store, files } = createStore({
      "项目/A.md": "# A\n\n## 资料\n\n旧资料\n"
    });
    const file = makeTFile("项目/A.md");

    await store.sendToProjectFile(file, "> [!quote]- 摘要\n> 长资料", "资料", undefined, { preformatted: true });

    expect(files.get("项目/A.md")?.content).toBe("# A\n\n## 资料\n\n> [!quote]- 摘要\n> 长资料\n\n旧资料\n");
  });

  it("sends task content to the task section using Obsidian Tasks format", async () => {
    const { store, files } = createStore(
      {
        "项目/A.md": "# A\n\n## 待办\n\n旧任务\n"
      },
      {
        projectTag: "项目",
        tasksFormatEnabled: true,
        taskDefaultSection: "待办",
        taskAddCreatedDate: true,
        taskAddProjectTag: true,
        taskDefaultPriority: "medium"
      }
    );
    const file = makeTFile("项目/A.md");

    await store.sendToProjectFile(file, "添加发送到项目功能", "待办", {
      isTask: true,
      priority: "medium",
      dueDate: "2026-06-20",
      addCreatedDate: true,
      createdDate: "2026-06-14"
    });

    expect(files.get("项目/A.md")?.content).toBe("# A\n\n## 待办\n\n- [ ] 添加发送到项目功能 #项目/A 🔼 📅 2026-06-20 ➕ 2026-06-14\n\n旧任务\n");
  });

  it("preserves code format as task detail when a send rule asks for tasks", async () => {
    const { store, files } = createStore(
      {
        "项目/A.md": "# A\n\n## 待办\n\n旧任务\n"
      },
      {
        tasksFormatEnabled: true,
        taskAddProjectTag: false,
        taskDefaultPriority: "none",
        taskAddCreatedDate: false
      }
    );
    const file = makeTFile("项目/A.md");

    await store.sendToProjectFile(
      file,
      "console.log(1)",
      "待办",
      {
        isTask: true,
        priority: "none",
        contentMode: "task-with-detail"
      },
      {
        template: {
          ...DEFAULT_SETTINGS.managedTemplates[0],
          insertFormat: "code",
          taskContentMode: "task-with-detail"
        }
      }
    );

    expect(files.get("项目/A.md")?.content).toBe("# A\n\n## 待办\n\n- [ ] console.log(1)\n  ```text\n  console.log(1)\n  ```\n\n旧任务\n");
  });

  it("preserves custom format as task detail when a send rule asks for tasks", async () => {
    const { store, files } = createStore(
      {
        "项目/A.md": "# A\n\n## 待办\n\n旧任务\n"
      },
      {
        tasksFormatEnabled: false
      }
    );
    const file = makeTFile("项目/A.md");

    await store.sendToProjectFile(
      file,
      "肩袖资料",
      "待办",
      {
        isTask: true,
        contentMode: "task-with-detail"
      },
      {
        template: {
          ...DEFAULT_SETTINGS.managedTemplates[0],
          insertFormat: "custom",
          advancedContentTemplate: "> [!note]- {{content}}\n> 来源：{{source}}",
          taskContentMode: "task-with-detail"
        }
      }
    );

    expect(files.get("项目/A.md")?.content).toBe("# A\n\n## 待办\n\n- [ ] 肩袖资料\n  > [!note]- 肩袖资料\n  > 来源：\n\n旧任务\n");
  });

  it("renders task-wrapper custom templates with one parent timestamp and one normalized child task", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 20, 17, 30));
    try {
      const { store, files } = createStore(
        {
          "项目/A.md": "# A\n\n## 待办\n\n旧任务\n"
        },
        {
          tasksFormatEnabled: true,
          taskAddProjectTag: false
        }
      );
      const file = makeTFile("项目/A.md");

      await store.sendToProjectFile(
        file,
        "* [ ] 测试多少安 🔺",
        "待办",
        {
          isTask: true,
          priority: "highest",
          startDate: "2026-06-20",
          addCreatedDate: true,
          createdDate: "2026-06-20"
        },
        {
          template: {
            ...DEFAULT_SETTINGS.managedTemplates[0],
            insertFormat: "custom",
            advancedContentTemplate: "- [ ] {{date}} {{time}}\n\t- {{content}}",
            taskContentMode: "task-with-detail"
          }
        }
      );

      expect(files.get("项目/A.md")?.content).toBe(
        "# A\n\n## 待办\n\n- [ ] 2026-06-20 17:30\n\t- [ ] 测试多少安 🔺 🛫 2026-06-20 ➕ 2026-06-20\n\n旧任务\n"
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps home, project-send, and quick-capture task options aligned for wrapped task output", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 22, 15, 30));
    try {
      const sharedTaskOptions = {
        isTask: true,
        priority: "highest",
        startDate: "2026-06-22",
        addCreatedDate: true,
        createdDate: "2026-06-22",
        contentMode: "task-with-detail"
      } as const;
      const expected = "- [ ] 2026-06-22 15:30\n\t- [ ] 测试任务 🔺 🛫 2026-06-22 ➕ 2026-06-22";

      for (const entry of ["home", "project-send", "quick-capture"]) {
        const { store, files } = createStore(
          {
            "项目/A.md": "# A\n\n## 待办\n\n旧任务\n"
          },
          {
            tasksFormatEnabled: true,
            taskAddProjectTag: false,
            taskDefaultScheduledDate: "",
            taskDefaultDueDate: "",
            taskDefaultRecurrence: "none",
            taskAddCreatedDate: false
          }
        );
        const file = makeTFile("项目/A.md");

        await store.sendToProjectFile(file, "- * [ ] 测试任务", "待办", { ...sharedTaskOptions }, {
          template: {
            ...DEFAULT_SETTINGS.managedTemplates[0],
            insertFormat: "custom",
            advancedContentTemplate: "- [ ] {{date}} {{time}}\n\t- {{content}}",
            taskContentMode: "task-with-detail"
          }
        });

        const content = files.get("项目/A.md")?.content ?? "";
        expect(content, entry).toContain(expected);
        expect(content, entry).not.toMatch(/- - \[ \]|- \* \[ \]|\[ \] - \[ \]/);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends normal content to an arbitrary file heading", async () => {
    const { store, files } = createStore({
      "医学/肩袖损伤.md": "# 肩袖损伤\n\n## 临床表现\n\n旧内容\n"
    });
    const file = makeTFile("医学/肩袖损伤.md");

    await store.sendToFileTarget(file, "冈上肌疼痛", { heading: "临床表现", position: "heading-top" });

    expect(files.get("医学/肩袖损伤.md")?.content).toContain("## 临床表现\n\n- 冈上肌疼痛\n  - 时间：");
    expect(files.get("医学/肩袖损伤.md")?.content).toContain("\n\n旧内容\n");
  });

  it("sends preformatted callout content to an arbitrary file target", async () => {
    const { store, files } = createStore({
      "医学/肩袖损伤.md": "# 肩袖损伤\n"
    });
    const file = makeTFile("医学/肩袖损伤.md");

    await store.sendToFileTarget(file, "> [!note]- 资料\n> 长内容", { position: "file-end" }, undefined, { preformatted: true });

    expect(files.get("医学/肩袖损伤.md")?.content).toBe("# 肩袖损伤\n\n> [!note]- 资料\n> 长内容\n");
  });

  it("updates only the memo source year file", async () => {
    const { store, processed } = createStore({
      "我的资源/Memos/2025.md": "# 2025\n\n## 2025-06\n\n### 2025-06-01 周日\n\n- 2025-06-01 08:00\n  old\n",
      "我的资源/Memos/2026.md": "# 2026\n\n## 2026-06\n\n### 2026-06-13 周六\n\n- 2026-06-13 09:00\n  new\n"
    });
    const doc = await store.readDocument();
    const memo2025 = doc.memos.find((memo) => memo.filePath.endsWith("2025.md"))!;

    await store.updateMemo(memo2025, "changed");

    expect(processed).toEqual(["我的资源/Memos/2025.md"]);
  });
});
