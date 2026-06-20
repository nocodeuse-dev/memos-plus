import { describe, expect, it, vi } from "vitest";
import { renderTaskContentWithOptions } from "../src/taskOptionsModal";
import { DEFAULT_SETTINGS } from "../src/settings";

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

describe("task options prompt helpers", () => {
  it("renders confirmed task settings as an Obsidian Tasks line", () => {
    expect(
      renderTaskContentWithOptions(
        "整理肩袖损伤查体",
        {
          isTask: true,
          priority: "high",
          startDate: "2026-06-18",
          scheduledDate: "2026-06-19",
          dueDate: "2026-06-20",
          recurrence: "weekly",
          addCreatedDate: true,
          createdDate: "2026-06-17",
          doneDate: "2026-06-21"
        },
        {
          ...DEFAULT_SETTINGS,
          tasksFormatEnabled: true,
          taskAddProjectTag: false
        }
      )
    ).toBe("- [ ] 整理肩袖损伤查体 ⏫ 🔁 every week 🛫 2026-06-18 ⏳ 2026-06-19 📅 2026-06-20 ➕ 2026-06-17 ✅ 2026-06-21");
  });

  it("falls back to plain markdown task syntax when Tasks compatibility is disabled", () => {
    expect(renderTaskContentWithOptions("- [ ] 已有任务", { isTask: true }, { ...DEFAULT_SETTINGS, tasksFormatEnabled: false })).toBe("- [ ] 已有任务");
  });

  it("keeps an existing callout as task detail instead of flattening it", () => {
    expect(
      renderTaskContentWithOptions(
        "> [!note]- 详情\n> 第二行",
        { isTask: true, contentMode: "task-with-detail", priority: "none" },
        { ...DEFAULT_SETTINGS, tasksFormatEnabled: false }
      )
    ).toBe("- [ ] 详情\n  > [!note]- 详情\n  > 第二行");
  });

  it("keeps an existing code block as task detail instead of flattening it", () => {
    expect(
      renderTaskContentWithOptions(
        "```text\nconsole.log(1)\n```",
        { isTask: true, contentMode: "task-with-detail", priority: "none" },
        { ...DEFAULT_SETTINGS, tasksFormatEnabled: false }
      )
    ).toBe("- [ ] console.log(1)\n  ```text\n  console.log(1)\n  ```");
  });

  it("can keep the legacy task-only behavior when requested", () => {
    expect(
      renderTaskContentWithOptions(
        "> [!note]- 详情\n> 第二行",
        { isTask: true, contentMode: "task-only", priority: "none" },
        { ...DEFAULT_SETTINGS, tasksFormatEnabled: false }
      )
    ).toBe("- [ ] 详情");
  });
});
