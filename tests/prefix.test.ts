import { describe, expect, it } from "vitest";
import { applyDefaultPrefix } from "../src/prefix";

describe("applyDefaultPrefix", () => {
  it("adds an unordered list prefix to plain memo content", () => {
    expect(applyDefaultPrefix("今天整理资料", "list")).toBe("- 今天整理资料");
  });

  it("adds a task prefix to plain memo content", () => {
    expect(applyDefaultPrefix("整理膝关节笔记", "task")).toBe("- [ ] 整理膝关节笔记");
  });

  it("keeps existing list or task prefixes unchanged", () => {
    expect(applyDefaultPrefix("- 已经是列表", "task")).toBe("- 已经是列表");
    expect(applyDefaultPrefix("- [ ] 已经是任务", "list")).toBe("- [ ] 已经是任务");
  });

  it("keeps blockquotes and callouts unchanged", () => {
    expect(applyDefaultPrefix("> [!note]- 标题\n> 内容", "list")).toBe("> [!note]- 标题\n> 内容");
  });

  it("prefixes the first non-empty line only", () => {
    expect(applyDefaultPrefix("\n\n正文", "list")).toBe("\n\n- 正文");
  });
});
