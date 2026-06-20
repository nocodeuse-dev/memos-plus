import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import {
  buildProjectFileContent,
  getProjectFiles,
  getProjectInfos,
  insertContentUnderHeading,
  projectPathForName
} from "../src/projectSend";

vi.mock("obsidian", () => {
  class TFile {
    basename: string;
    extension = "md";

    constructor(readonly path: string, readonly name = path.split("/").pop() ?? path) {
      this.basename = name.replace(/\.md$/i, "");
    }
  }

  return {
    App: class {},
    Notice: class {},
    PluginSettingTab: class {},
    Setting: class {},
    SuggestModal: class {},
    FuzzySuggestModal: class {},
    TFile,
    TFolder: class {},
    getAllTags: (cache: { tags?: Array<{ tag: string }> }) => cache.tags?.map((item) => item.tag) ?? null,
    normalizePath: (value: string) => value.replace(/\/+/g, "/").replace(/\/$/, "")
  };
});

function makeTFile(path: string): TFile {
  const FileCtor = TFile as unknown as new (path: string) => TFile;
  return new FileCtor(path);
}

function createApp(files: Record<string, string>, frontmatterTags: Record<string, unknown> = {}, bodyTags: Record<string, string[]> = {}) {
  const fileObjects = Object.keys(files).map((path) => makeTFile(path));
  const app = {
    vault: {
      getMarkdownFiles: vi.fn(() => fileObjects),
      read: vi.fn(async (file: TFile) => files[file.path] ?? ""),
      process: vi.fn(async (file: TFile, updater: (source: string) => string) => {
        files[file.path] = updater(files[file.path] ?? "");
      })
    },
    metadataCache: {
      getFileCache: vi.fn((file: TFile) => ({
        frontmatter: frontmatterForTest(frontmatterTags[file.path]),
        tags: bodyTags[file.path]?.map((tag) => ({ tag }))
      }))
    }
  };
  return { app, files, fileObjects };
}

function frontmatterForTest(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  return { tags: value };
}

describe("project send helpers", () => {
  it("finds project files from frontmatter tags and body tags", async () => {
    const { app } = createApp(
      {
        "Projects/B.md": "# B\n#项目\n",
        "Projects/A.md": "# A\n",
        "Notes/Other.md": "# Other\n#普通\n"
      },
      {
        "Projects/A.md": ["项目"],
        "Notes/Other.md": ["普通"]
      },
      {
        "Projects/B.md": ["#项目"],
        "Notes/Other.md": ["#普通"]
      }
    );

    const files = await getProjectFiles(app as never, "项目");

    expect(files.map((file) => file.path)).toEqual(["Projects/A.md", "Projects/B.md"]);
  });

  it("uses cached body tags without reading every markdown file", async () => {
    const { app } = createApp(
      {
        "Projects/B.md": "",
        "Projects/A.md": "",
        "Notes/Other.md": ""
      },
      {},
      {
        "Projects/B.md": ["#项目"],
        "Notes/Other.md": ["#普通"]
      }
    );

    const files = await getProjectFiles(app as never, "项目");

    expect(files.map((file) => file.path)).toEqual(["Projects/B.md"]);
    expect(app.vault.read).not.toHaveBeenCalled();
  });

  it("returns active project info with recent projects first and hides completed or archived by default", async () => {
    const { app } = createApp(
      {
        "Projects/Old.md": "",
        "Projects/Recent.md": "",
        "Projects/Done.md": "",
        "Projects/Archived.md": ""
      },
      {
        "Projects/Old.md": { tags: ["项目"], status: "进行中" },
        "Projects/Recent.md": { tags: ["项目"], status: "暂停" },
        "Projects/Done.md": { tags: ["项目"], status: "完成" },
        "Projects/Archived.md": { tags: ["项目"], status: "归档" }
      }
    );

    const projects = await getProjectInfos(app as never, "项目", {
      recentProjectPaths: ["Projects/Recent.md"],
      showArchivedProjects: false
    });

    expect(projects.map((project) => `${project.name}:${project.status}`)).toEqual(["Recent:暂停", "Old:进行中"]);
  });

  it("can include completed and archived project info when enabled", async () => {
    const { app } = createApp(
      {
        "Projects/Done.md": "",
        "Projects/Archived.md": ""
      },
      {
        "Projects/Done.md": { tags: ["项目"], status: "完成" },
        "Projects/Archived.md": { tags: ["项目"], status: "归档" }
      }
    );

    const projects = await getProjectInfos(app as never, "项目", {
      recentProjectPaths: [],
      showArchivedProjects: true
    });

    expect(projects.map((project) => project.status).sort()).toEqual(["完成", "归档"]);
  });

  it("builds a simple tagged project file with default sections", () => {
    expect(buildProjectFileContent("Memos Plus 插件开发", "项目", ["收集箱", "待办"])).toBe(
      ["---", "tags:", "  - 项目", "status: 进行中", "---", "", "# Memos Plus 插件开发", "", "## 收集箱", "", "## 待办", ""].join("\n")
    );
  });

  it("builds a unique project path from a human project name", () => {
    expect(projectPathForName("项目", "Memos Plus/插件开发", new Set(["项目/Memos Plus 插件开发.md"]))).toBe("项目/Memos Plus 插件开发 2.md");
  });

  it("inserts rendered content directly under a matching heading regardless of level", async () => {
    const { app, files, fileObjects } = createApp({
      "Projects/A.md": ["# 项目 A", "", "## 项目目标", "", "内容 A", "", "## 收集箱", "", "旧内容", "", "## 待处理", "", "内容 B", ""].join("\n")
    });

    const result = await insertContentUnderHeading(app as never, fileObjects[0], "收集箱", "- 新 memo 内容", true);

    expect(result).toBe("inserted");
    expect(files["Projects/A.md"]).toBe(
      ["# 项目 A", "", "## 项目目标", "", "内容 A", "", "## 收集箱", "", "- 新 memo 内容", "", "旧内容", "", "## 待处理", "", "内容 B", ""].join("\n")
    );
  });

  it("matches headings that are indented by up to three spaces", async () => {
    const { app, files, fileObjects } = createApp({
      "Projects/A.md": "# 项目 A\n\n  ## 收集箱\n\n旧内容\n"
    });

    const result = await insertContentUnderHeading(app as never, fileObjects[0], "收集箱", "- 新 memo 内容", true);

    expect(result).toBe("inserted");
    expect(files["Projects/A.md"]).toBe("# 项目 A\n\n  ## 收集箱\n\n- 新 memo 内容\n\n旧内容\n");
  });

  it("creates the configured heading at the end when missing and enabled", async () => {
    const { app, files, fileObjects } = createApp({
      "Projects/A.md": "# 项目 A\n"
    });

    const result = await insertContentUnderHeading(app as never, fileObjects[0], "收集箱", "- 新 memo 内容", true);

    expect(result).toBe("inserted");
    expect(files["Projects/A.md"]).toBe("# 项目 A\n\n## 收集箱\n\n- 新 memo 内容\n");
  });

  it("does not treat plain body text as a matching heading", async () => {
    const { app, files, fileObjects } = createApp({
      "Projects/A.md": "# 项目 A\n\n收集箱\n\n旧内容\n"
    });

    const result = await insertContentUnderHeading(app as never, fileObjects[0], "收集箱", "- 新 memo 内容", true);

    expect(result).toBe("inserted");
    expect(files["Projects/A.md"]).toBe("# 项目 A\n\n收集箱\n\n旧内容\n\n## 收集箱\n\n- 新 memo 内容\n");
  });

  it("does not modify the file when the heading is missing and creation is disabled", async () => {
    const { app, files, fileObjects } = createApp({
      "Projects/A.md": "# 项目 A\n"
    });

    const result = await insertContentUnderHeading(app as never, fileObjects[0], "收集箱", "- 新 memo 内容", false);

    expect(result).toBe("missing-heading");
    expect(files["Projects/A.md"]).toBe("# 项目 A\n");
  });
});
