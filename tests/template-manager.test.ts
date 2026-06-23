import { describe, expect, it, vi } from "vitest";
import {
  buildTemplateFileContent,
  buildTemplateFilePath,
  createDefaultProjectTemplate,
  normalizeManagedTemplates,
  resolveTemplateAfterTransferAction,
  resolveTemplateClearAfterSend,
  resolveTemplateTaskDecision,
  renderTemplateVariables
} from "../src/templateManager";

vi.mock("obsidian", () => ({
  normalizePath: (value: string) => {
    if (!value.trim()) {
      return "/";
    }
    return value.replace(/\/+/g, "/").replace(/\/$/, "");
  }
}));

describe("template manager helpers", () => {
  it("creates a default project template compatible with existing project settings", () => {
    const template = createDefaultProjectTemplate("项目", "项目", "收集箱");

    expect(template.name).toBe("发送到项目");
    expect(template.type).toBe("project");
    expect(template.targetSource).toBe("project-tag");
    expect(template.recognitionTag).toBe("项目");
    expect(template.folderPath).toBe("项目");
    expect(template.defaultTags).toEqual(["项目"]);
    expect(template.heading).toBe("收集箱");
    expect(template.insertLocation).toBe("heading");
    expect(template.insertFormat).toBe("note");
    expect(template.taskMode).toBe("ask");
    expect(template.clearAfterSendMode).toBe("global");
    expect(template.clearAfterSend).toBe(true);
    expect(template.afterTransferActionMode).toBe("global");
    expect(template.afterTransferAction).toBe("keep");
    expect(template.createHeadingIfMissing).toBe(true);
  });

  it("normalizes templates and keeps existing user definitions safe", () => {
    expect(
      normalizeManagedTemplates([
        {
          id: "abc",
          name: " 病例模板 ",
          type: "case",
          templateFilePath: " 模板//病例.md ",
          folderPath: " 医学//病例 ",
          filenameRule: "date-title",
          defaultTags: ["#病例", " 病例 ", ""],
          targetSource: "specific-tag",
          recognitionTag: " 病 ",
          fixedFilePath: " 医学//疾病.md ",
          heading: " 记录 ",
          insertLocation: "new-heading",
          insertFormat: "callout",
          taskMode: "auto",
          taskAutoKeywords: ["任务", "todo"],
          taskAutoTags: ["任务"],
          taskAutoPrefixes: ["任务："],
          taskAutoHeadings: ["待办"],
          taskAutoUseInsertFormat: true,
          taskAutoUseTemplateName: true,
          taskAutoConfirm: true,
          insertPosition: "new-heading",
          newHeadingName: " 康复训练 ",
          newHeadingLevel: 3,
          newHeadingPosition: "file-start",
          existingHeadingBehavior: "create-duplicate",
          createHeadingIfMissing: false,
          clearAfterSend: false,
          afterTransferAction: "archive"
        },
        { name: "" }
      ])
    ).toMatchObject([
      {
        id: "abc",
        name: "病例模板",
        type: "case",
        templateFilePath: "模板/病例.md",
        folderPath: "医学/病例",
        filenameRule: "date-title",
        defaultTags: ["病例"],
        targetSource: "specific-tag",
        recognitionTag: "病",
        fixedFilePath: "医学/疾病.md",
        heading: "记录",
        insertLocation: "new-heading",
        insertFormat: "callout",
        taskMode: "auto",
        taskAutoKeywords: ["任务", "todo"],
        taskAutoTags: ["任务"],
        taskAutoPrefixes: ["任务："],
        taskAutoHeadings: ["待办"],
        taskAutoUseInsertFormat: true,
        taskAutoUseTemplateName: true,
        taskAutoConfirm: true,
        insertPosition: "new-heading",
        newHeadingName: "康复训练",
        newHeadingLevel: 3,
        newHeadingPosition: "file-start",
        existingHeadingBehavior: "create-duplicate",
        createHeadingIfMissing: false,
        clearAfterSendMode: "custom",
        clearAfterSend: false,
        afterTransferActionMode: "custom",
        afterTransferAction: "archive"
      }
    ]);
  });

  it("fills new delivery fields when normalizing old template definitions", () => {
    expect(
      normalizeManagedTemplates([
        {
          id: "legacy",
          name: "旧模板",
          type: "project",
          folderPath: "项目",
          defaultTags: ["项目"],
          heading: "资料"
        }
      ])
    ).toMatchObject([
      {
        id: "legacy",
        name: "旧模板",
        type: "project",
        targetSource: "project-tag",
        recognitionTag: "项目",
        folderPath: "项目",
        heading: "资料",
        insertLocation: "heading",
        insertFormat: "note",
        taskMode: "ask",
        clearAfterSendMode: "global",
        clearAfterSend: true,
        afterTransferActionMode: "global",
        afterTransferAction: "keep"
      }
    ]);
  });

  it("promotes note rules with custom template content to custom format", () => {
    expect(
      normalizeManagedTemplates([
        {
          id: "custom-note",
          name: "自定义但仍是普通笔记",
          insertFormat: "note",
          advancedContentTemplate: "- {{datetime}}\n{{content}}"
        }
      ])
    ).toMatchObject([
      {
        id: "custom-note",
        insertFormat: "custom",
        advancedContentTemplate: "- {{datetime}}\n{{content}}"
      }
    ]);
  });

  it("keeps optional template paths empty instead of normalizing them to the vault root", () => {
    expect(
      normalizeManagedTemplates([
        {
          id: "empty-paths",
          name: "空路径模板",
          templateFilePath: "   ",
          fixedFilePath: "/"
        }
      ])
    ).toMatchObject([
      {
        id: "empty-paths",
        templateFilePath: "",
        fixedFilePath: ""
      }
    ]);
  });

  it("resolves rule-level global/custom post-send behavior without losing legacy values", () => {
    const base = createDefaultProjectTemplate("项目", "项目", "收集箱");
    const [legacy] = normalizeManagedTemplates([
      {
        id: "legacy",
        name: "旧规则",
        clearAfterSend: false,
        afterTransferAction: "archive"
      }
    ]);

    expect(resolveTemplateClearAfterSend(base, false)).toBe(false);
    expect(resolveTemplateAfterTransferAction(base, "delete")).toBe("delete");
    expect(legacy.clearAfterSendMode).toBe("custom");
    expect(legacy.afterTransferActionMode).toBe("custom");
    expect(resolveTemplateClearAfterSend(legacy, true)).toBe(false);
    expect(resolveTemplateAfterTransferAction(legacy, "delete")).toBe("archive");
  });

  it("builds file paths from visual filename rules", () => {
    const template = createDefaultProjectTemplate("项目", "项目", "收集箱");

    expect(buildTemplateFilePath(template, "肩袖损伤", new Date(2026, 5, 16, 8, 9))).toBe("项目/肩袖损伤.md");
    expect(buildTemplateFilePath({ ...template, filenameRule: "date-title" }, "肩袖损伤", new Date(2026, 5, 16, 8, 9))).toBe(
      "项目/2026-06-16 肩袖损伤.md"
    );
    expect(buildTemplateFilePath({ ...template, filenameRule: "datetime-title" }, "肩袖损伤", new Date(2026, 5, 16, 8, 9))).toBe(
      "项目/2026-06-16 08-09 肩袖损伤.md"
    );
  });

  it("resolves task sending from the selected insert format only", () => {
    const base = createDefaultProjectTemplate("项目", "项目", "收集箱");

    expect(resolveTemplateTaskDecision({ ...base, taskMode: "none" }, { content: "任务：整理资料", heading: "待办" })).toBe("none");
    expect(resolveTemplateTaskDecision({ ...base, insertFormat: "task", taskMode: "ask" }, { content: "普通内容", heading: "资料" })).toBe("task");
    expect(resolveTemplateTaskDecision({ ...base, taskMode: "always" }, { content: "普通内容", heading: "资料" })).toBe("none");
    expect(resolveTemplateTaskDecision({ ...base, taskMode: "ask" }, { content: "普通内容", heading: "资料" })).toBe("none");
    expect(
      resolveTemplateTaskDecision(
        {
          ...base,
          taskMode: "auto",
          taskAutoKeywords: ["todo"],
          taskAutoTags: ["任务"],
          taskAutoPrefixes: ["任务："],
          taskAutoHeadings: ["下一步"],
          taskAutoUseInsertFormat: true,
          taskAutoUseTemplateName: false,
          taskAutoConfirm: false
        },
        { content: "普通内容", heading: "资料" }
      )
    ).toBe("none");
    expect(resolveTemplateTaskDecision({ ...base, taskMode: "auto", taskAutoPrefixes: ["任务："] }, { content: "任务：整理资料", heading: "资料" })).toBe(
      "none"
    );
    expect(resolveTemplateTaskDecision({ ...base, taskMode: "auto", taskAutoTags: ["任务"] }, { content: "整理资料 #任务", heading: "资料" })).toBe(
      "none"
    );
    expect(resolveTemplateTaskDecision({ ...base, taskMode: "auto", taskAutoHeadings: ["下一步"] }, { content: "整理资料", heading: "下一步" })).toBe(
      "none"
    );
    expect(
      resolveTemplateTaskDecision({ ...base, taskMode: "auto", taskAutoUseInsertFormat: true, insertFormat: "task" }, { content: "整理资料", heading: "资料" })
    ).toBe("task");
    expect(resolveTemplateTaskDecision({ ...base, taskMode: "auto", taskAutoKeywords: ["todo"], taskAutoConfirm: true }, { content: "todo 整理", heading: "资料" })).toBe(
      "none"
    );
  });

  it("renders template variables and adds the active tag to new files", () => {
    const template = createDefaultProjectTemplate("项目", "项目", "收集箱");
    const context = {
      title: "肩袖损伤",
      content: "冈上肌腱损伤",
      tag: "病",
      source: "https://example.com",
      folder: "医学/疾病",
      now: new Date(2026, 5, 16, 8, 9)
    };

    expect(renderTemplateVariables("{{title}} {{date}} {{time}} {{datetime}} {{content}} {{tag}} {{source}} {{folder}}", context)).toBe(
      "肩袖损伤 2026-06-16 08:09 2026-06-16 08:09 冈上肌腱损伤 病 https://example.com 医学/疾病"
    );
    expect(buildTemplateFileContent(template, context)).toContain("  - 病");
  });
});
