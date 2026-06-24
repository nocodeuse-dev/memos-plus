import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsSource = readFileSync("src/settings.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");
const quickInputViewSource = readFileSync("src/quickInputView.ts", "utf8");

describe("configurable icon wiring", () => {
  it("renders sidebar and quick input icons through the shared configurable helper", () => {
    expect(viewSource).toContain("renderConfigurableIcon");
    expect(viewSource).toContain("iconOverrideIdForOrganizerFilter");
    expect(quickInputViewSource).toContain("renderConfigurableIcon");
    expect(quickInputViewSource).toContain("entry.iconOverrideId");
  });

  it("exposes a simple settings section without SVG, URL, or HTML icon inputs", () => {
    expect(settingsSource).toContain("renderIconOverrideSettings");
    expect(settingsSource).toContain("settings.iconOverrides");
    expect(settingsSource).toContain("settings.iconOverrideTypeEmoji");
    expect(settingsSource).toContain("settings.iconOverrideTypeLucide");
    expect(settingsSource).not.toContain("settings.iconOverrideTypeSvg");
    expect(settingsSource).not.toContain("settings.iconOverrideUrl");
  });
});
