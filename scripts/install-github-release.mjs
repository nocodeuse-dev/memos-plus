import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const REPOSITORY = "nocodeuse-dev/memos-plus";
const PLUGIN_ID = "memos-plus";
const VAULT_NAME = "Steamboy";
const VAULT_DOT_OBSIDIAN = "/Users/yangjiahao/Documents/Steamboy/.obsidian";
const TARGET_DIR = `${VAULT_DOT_OBSIDIAN}/plugins/${PLUGIN_ID}`;
const COMMUNITY_PLUGINS_PATH = `${VAULT_DOT_OBSIDIAN}/community-plugins.json`;
const OBSIDIAN = "/Applications/Obsidian.app/Contents/MacOS/obsidian";
const DIST_FILES = ["main.js", "manifest.json", "styles.css"];

let githubToken;

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalizeTag(tag) {
  if (!tag) {
    return undefined;
  }
  return tag.startsWith("v") ? tag : `v${tag}`;
}

function getGitHubToken() {
  if (githubToken !== undefined) {
    return githubToken;
  }

  githubToken = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? "";
  if (!githubToken) {
    const result = spawnSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: "pipe"
    });
    if (result.status === 0) {
      githubToken = result.stdout.trim();
    }
  }
  return githubToken;
}

function githubHeaders(accept) {
  const token = getGitHubToken();
  return {
    "Accept": accept,
    "User-Agent": "memos-plus-installer",
    ...(token ? { "Authorization": `Bearer ${token}` } : {})
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: githubHeaders("application/vnd.github+json")
  });
  if (!response.ok) {
    throw new Error(`GitHub request failed: ${response.status} ${response.statusText} ${url}`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: githubHeaders("application/octet-stream")
  });
  if (!response.ok) {
    throw new Error(`Release asset download failed: ${response.status} ${response.statusText} ${url}`);
  }
  return response.text();
}

async function getRelease() {
  const tag = normalizeTag(optionValue("--tag"));
  const path = tag ? `releases/tags/${tag}` : "releases/latest";
  return fetchJson(`https://api.github.com/repos/${REPOSITORY}/${path}`);
}

function findAsset(release, name) {
  const asset = release.assets?.find((item) => item.name === name);
  if (!asset?.browser_download_url) {
    throw new Error(`Release ${release.tag_name} is missing asset ${name}`);
  }
  return asset.browser_download_url;
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

function reloadPlugin() {
  if (!existsSync(OBSIDIAN)) {
    console.warn(`Obsidian CLI not found at ${OBSIDIAN}; skipped reload.`);
    return;
  }
  const result = spawnSync(OBSIDIAN, [`vault=${VAULT_NAME}`, "plugin:reload", `id=${PLUGIN_ID}`], {
    encoding: "utf8",
    stdio: "pipe"
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0 || output.includes("Error:")) {
    throw new Error(output || `Could not reload ${PLUGIN_ID}`);
  }
  if (output) {
    console.log(output);
  }
}

async function main() {
  const release = await getRelease();
  await mkdir(TARGET_DIR, { recursive: true });

  for (const file of DIST_FILES) {
    const content = await fetchText(findAsset(release, file));
    await writeFile(join(TARGET_DIR, file), content);
  }

  const manifest = JSON.parse(await readFile(join(TARGET_DIR, "manifest.json"), "utf8"));
  if (manifest.id !== PLUGIN_ID) {
    throw new Error(`Downloaded manifest id mismatch: expected ${PLUGIN_ID}, got ${manifest.id}`);
  }
  if (normalizeTag(manifest.version) !== release.tag_name) {
    throw new Error(`Downloaded manifest version ${manifest.version} does not match release ${release.tag_name}`);
  }

  await ensurePluginEnabled();

  if (!process.argv.includes("--no-reload")) {
    reloadPlugin();
  }

  console.log(`Installed ${PLUGIN_ID} ${manifest.version} from ${REPOSITORY} ${release.tag_name} to ${TARGET_DIR}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
