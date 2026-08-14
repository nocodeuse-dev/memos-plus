import { describe, expect, it } from "vitest";
import { resolveSendTaskIntent } from "../src/sendTaskIntent";

describe("send task intent", () => {
  it("forces one task settings step for any selected file or heading", () => {
    expect(resolveSendTaskIntent(true, "none", false)).toBe("prompt");
    expect(resolveSendTaskIntent(true, "task", false)).toBe("prompt");
    expect(resolveSendTaskIntent(true, "ask", true)).toBe("prompt");
  });

  it("preserves the existing template-driven behavior when the checkbox is off", () => {
    expect(resolveSendTaskIntent(false, "none", false)).toBe("plain");
    expect(resolveSendTaskIntent(false, "task", false)).toBe("default-task");
    expect(resolveSendTaskIntent(false, "task", true)).toBe("prompt");
    expect(resolveSendTaskIntent(false, "ask", false)).toBe("prompt");
  });
});
