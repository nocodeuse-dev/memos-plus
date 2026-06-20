import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const syncSource = readFileSync("scripts/sync.mjs", "utf8");

describe("sync script", () => {
  it("preserves the installed enabled plugin list for mobile sync", () => {
    expect(syncSource).toContain("COMMUNITY_PLUGINS_PATH");
    expect(syncSource).toContain("ensurePluginEnabled");
    expect(syncSource).toContain("community-plugins.json");
    expect(syncSource).toContain("PLUGIN_ID");
  });
});
