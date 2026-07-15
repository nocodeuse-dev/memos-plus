import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const syncSource = readFileSync("scripts/sync.mjs", "utf8");
const githubReleaseSyncSource = readFileSync("scripts/sync-github-release.mjs", "utf8");
const releaseWorkflowSource = readFileSync(".github/workflows/release.yml", "utf8");

describe("sync script", () => {
  it("preserves the installed enabled plugin list for mobile sync", () => {
    expect(syncSource).toContain("COMMUNITY_PLUGINS_PATH");
    expect(syncSource).toContain("ensurePluginEnabled");
    expect(syncSource).toContain("community-plugins.json");
    expect(syncSource).toContain("PLUGIN_ID");
  });

  it("runs local release checks before mutating version metadata", () => {
    const versionBumpIndex = githubReleaseSyncSource.indexOf("const version = await bumpVersion();");

    expect(githubReleaseSyncSource.indexOf('run("git", ["diff", "--check"]);')).toBeLessThan(versionBumpIndex);
    expect(githubReleaseSyncSource.indexOf('run("npm", ["test"]);')).toBeLessThan(versionBumpIndex);
    expect(githubReleaseSyncSource.indexOf('run("npm", ["run", "lint"]);')).toBeLessThan(versionBumpIndex);
    expect(githubReleaseSyncSource.indexOf('run("npm", ["run", "build"]);')).toBeLessThan(versionBumpIndex);
  });

  it("keeps lint in the GitHub release gate", () => {
    expect(releaseWorkflowSource).toContain("- name: Lint\n        run: npm run lint");
  });
});
