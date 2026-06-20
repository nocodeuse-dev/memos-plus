export type ImageHandlingMode = "auto" | "memos" | "image-auto-upload";

const IMAGE_AUTO_UPLOAD_PLUGIN_IDS = ["obsidian-image-auto-upload-plugin", "image-auto-upload-plugin", "image-auto-upload"];

export function normalizeImageHandlingMode(value: unknown): ImageHandlingMode {
  if (value === "memos" || value === "image-auto-upload" || value === "auto") {
    return value;
  }
  return "auto";
}

export function isImageAutoUploadEnabled(appLike: unknown): boolean {
  const pluginsHost = isRecord(appLike) && isRecord(appLike.plugins) ? appLike.plugins : undefined;
  if (!pluginsHost) {
    return false;
  }
  if (isEnabledPluginId(pluginsHost.enabledPlugins)) {
    return true;
  }
  return hasLoadedEnabledPlugin(pluginsHost.plugins);
}

export function shouldMemosHandleImagePaste(mode: ImageHandlingMode, appLike: unknown): boolean {
  if (mode === "memos") {
    return true;
  }
  if (mode === "image-auto-upload") {
    return false;
  }
  return !isImageAutoUploadEnabled(appLike);
}

function isEnabledPluginId(enabledPlugins: unknown): boolean {
  if (enabledPlugins instanceof Set) {
    return IMAGE_AUTO_UPLOAD_PLUGIN_IDS.some((id) => enabledPlugins.has(id));
  }
  if (Array.isArray(enabledPlugins)) {
    return IMAGE_AUTO_UPLOAD_PLUGIN_IDS.some((id) => enabledPlugins.includes(id));
  }
  if (isRecord(enabledPlugins)) {
    return IMAGE_AUTO_UPLOAD_PLUGIN_IDS.some((id) => enabledPlugins[id] === true);
  }
  if (hasMethod(enabledPlugins, "has")) {
    return IMAGE_AUTO_UPLOAD_PLUGIN_IDS.some((id) => enabledPlugins.has(id));
  }
  return false;
}

function hasLoadedEnabledPlugin(plugins: unknown): boolean {
  if (!isRecord(plugins)) {
    return false;
  }
  return IMAGE_AUTO_UPLOAD_PLUGIN_IDS.some((id) => {
    const plugin = plugins[id];
    if (!plugin) {
      return false;
    }
    return !isRecord(plugin) || plugin.enabled !== false;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasMethod<T extends string>(value: unknown, method: T): value is Record<T, (argument: string) => boolean> {
  return isRecord(value) && typeof value[method] === "function";
}
