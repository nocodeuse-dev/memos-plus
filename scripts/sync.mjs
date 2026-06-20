import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const PLUGIN_ID = "memos-plus";
const VAULT_NAME = "Steamboy";
const VAULT_DOT_OBSIDIAN = "/Users/yangjiahao/Documents/Steamboy/.obsidian";
const TARGET_DIR = `/Users/yangjiahao/Documents/Steamboy/.obsidian/plugins/${PLUGIN_ID}`;
const COMMUNITY_PLUGINS_PATH = `${VAULT_DOT_OBSIDIAN}/community-plugins.json`;
const OBSIDIAN = "/Applications/Obsidian.app/Contents/MacOS/obsidian";
const DIST_FILES = ["main.js", "manifest.json", "styles.css"];

const noBump = process.argv.includes("--no-bump");
const noReload = process.argv.includes("--no-reload");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit"
  });
  if (result.status !== 0 && !options.allowFailure) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new Error(`Command failed: ${command} ${args.join(" ")}${output ? `\n${output}` : ""}`);
  }
  return result;
}

async function readJson(path) {
  return JSON.parse(await readFile(join(ROOT, path), "utf8"));
}

async function writeJson(path, value) {
  await writeFile(join(ROOT, path), `${JSON.stringify(value, null, 2)}\n`);
}

function bumpPatch(version) {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Cannot bump non-semver version: ${version}`);
  }
  parts[2] += 1;
  return parts.join(".");
}

async function bumpVersion() {
  const pkg = await readJson("package.json");
  const manifest = await readJson("manifest.json");
  const versions = await readJson("versions.json");
  const lock = await readJson("package-lock.json");
  const nextVersion = bumpPatch(manifest.version);

  pkg.version = nextVersion;
  manifest.version = nextVersion;
  versions[nextVersion] = manifest.minAppVersion;
  if (lock.version !== undefined) {
    lock.version = nextVersion;
  }
  if (lock.packages?.[""]?.version !== undefined) {
    lock.packages[""].version = nextVersion;
  }

  await writeJson("package.json", pkg);
  await writeJson("manifest.json", manifest);
  await writeJson("versions.json", versions);
  await writeJson("package-lock.json", lock);
  return nextVersion;
}

async function copyDist() {
  await mkdir(TARGET_DIR, { recursive: true });
  for (const file of DIST_FILES) {
    await copyFile(join(ROOT, file), join(TARGET_DIR, file));
  }
}

async function ensurePluginEnabled() {
  let enabled = [];
  try {
    const parsed = JSON.parse(await readFile(COMMUNITY_PLUGINS_PATH, "utf8"));
    enabled = Array.isArray(parsed) ? parsed.filter((pluginId) => typeof pluginId === "string") : [];
  } catch {
    enabled = [];
  }
  if (!enabled.includes(PLUGIN_ID)) {
    enabled.push(PLUGIN_ID);
  }
  await mkdir(dirname(COMMUNITY_PLUGINS_PATH), { recursive: true });
  await writeFile(COMMUNITY_PLUGINS_PATH, `${JSON.stringify(enabled, null, 2)}\n`);
}

function obsidian(args, options = {}) {
  return run(OBSIDIAN, [`vault=${VAULT_NAME}`, ...args], options);
}

function reloadPlugin() {
  if (!existsSync(OBSIDIAN)) {
    console.warn(`Obsidian CLI not found at ${OBSIDIAN}; skipped reload.`);
    return;
  }
  const result = obsidian(["plugin:reload", `id=${PLUGIN_ID}`], { capture: true, allowFailure: true });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0 || output.includes("Error:")) {
    throw new Error(output || `Could not reload ${PLUGIN_ID}`);
  }
  if (output) {
    console.log(output);
  }
}

async function main() {
  const version = noBump ? (await readJson("manifest.json")).version : await bumpVersion();

  run("npm", ["run", "build"]);
  await copyDist();
  await ensurePluginEnabled();

  if (!noReload) {
    reloadPlugin();
  }

  console.log(`Synced ${PLUGIN_ID} ${version} to ${TARGET_DIR}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
