import { describe, expect, it, vi } from "vitest";
import { renderWithTemplater, findTemplaterPlugin } from "../src/templaterAdapter";

const notices: string[] = [];

vi.mock("obsidian", () => ({
  Notice: class {
    constructor(message: string) {
      notices.push(message);
    }
  },
  TFile: class {}
}));

describe("templater adapter", () => {
  it("detects the enabled third-party Templater plugin without importing it", () => {
    const templaterPlugin = { templater: {} };
    const app = {
      plugins: {
        enabledPlugins: new Set(["templater-obsidian"]),
        plugins: {
          "templater-obsidian": templaterPlugin
        }
      }
    };

    expect(findTemplaterPlugin(app as never)).toBe(templaterPlugin);
  });

  it("renders a template through Templater parse_template with the target file context", async () => {
    const templateFile = { path: "模板/日记.md", basename: "日记" };
    const targetFile = { path: "笔记/今天.md", basename: "今天" };
    const create_running_config = vi.fn((template, target, runMode) => ({ template_file: template, target_file: target, run_mode: runMode }));
    const parse_template = vi.fn(async (config, source: string) => source.replace("<% tp.file.title %>", config.target_file.basename));
    const start_templater_task = vi.fn();
    const end_templater_task = vi.fn();
    const app = {
      plugins: {
        enabledPlugins: new Set(["templater-obsidian"]),
        plugins: {
          "templater-obsidian": {
            templater: {
              create_running_config,
              parse_template,
              start_templater_task,
              end_templater_task
            }
          }
        }
      }
    };

    await expect(
      renderWithTemplater(app as never, {
        templateFile: templateFile as never,
        targetFile: targetFile as never,
        templateSource: "# <% tp.file.title %>"
      })
    ).resolves.toBe("# 今天");
    expect(create_running_config).toHaveBeenCalledWith(templateFile, targetFile, 0);
    expect(parse_template).toHaveBeenCalledWith(expect.objectContaining({ target_file: targetFile }), "# <% tp.file.title %>");
    expect(start_templater_task).toHaveBeenCalledWith("笔记/今天.md");
    expect(end_templater_task).toHaveBeenCalledWith("笔记/今天.md");
  });

  it("returns null and shows a notice when Templater is unavailable or fails", async () => {
    notices.length = 0;
    await expect(
      renderWithTemplater({ plugins: { enabledPlugins: new Set(), plugins: {} } } as never, {
        templateFile: null,
        targetFile: { path: "笔记/今天.md", basename: "今天" } as never,
        templateSource: "# <% tp.file.title %>"
      })
    ).resolves.toBeNull();
    expect(notices).toEqual([]);

    const app = {
      plugins: {
        enabledPlugins: new Set(["templater-obsidian"]),
        plugins: {
          "templater-obsidian": {
            templater: {
              parse_template: vi.fn(async () => {
                throw new Error("boom");
              })
            }
          }
        }
      }
    };

    await expect(
      renderWithTemplater(app as never, {
        templateFile: null,
        targetFile: { path: "笔记/今天.md", basename: "今天" } as never,
        templateSource: "# <% tp.file.title %>"
      })
    ).resolves.toBeNull();
    expect(notices.at(-1)).toContain("Templater");
  });

  it("falls back instead of waiting forever when Templater stalls", async () => {
    vi.useFakeTimers();
    notices.length = 0;
    try {
      const app = {
        plugins: {
          enabledPlugins: new Set(["templater-obsidian"]),
          plugins: {
            "templater-obsidian": {
              templater: {
                parse_template: vi.fn(() => new Promise(() => undefined))
              }
            }
          }
        }
      };
      const render = renderWithTemplater(app as never, {
        templateFile: null,
        targetFile: { path: "笔记/超时.md", basename: "超时" } as never,
        templateSource: "# 超时回退",
        timeoutMs: 20
      });

      await vi.advanceTimersByTimeAsync(21);

      await expect(render).resolves.toBeNull();
      expect(notices.at(-1)).toContain("Templater");
    } finally {
      vi.useRealTimers();
    }
  });
});
