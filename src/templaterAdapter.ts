import { Notice, type App, type TFile } from "obsidian";

const TEMPLATER_PLUGIN_ID = "templater-obsidian";
const TEMPLATER_RUN_MODE_CREATE_NEW_FROM_TEMPLATE = 0;

interface ObsidianPluginRegistry {
  enabledPlugins?: Set<string> | string[];
  plugins?: Record<string, unknown>;
}

interface AppWithPluginRegistry extends App {
  plugins?: ObsidianPluginRegistry;
}

interface TemplaterPlugin {
  templater?: TemplaterRuntime;
}

interface TemplaterRuntime {
  create_running_config?: (templateFile: TFile | null, targetFile: TFile, runMode: number) => unknown;
  parse_template?: (config: unknown, source: string) => Promise<unknown>;
  read_and_parse_template?: (config: unknown) => Promise<unknown>;
  start_templater_task?: (path: string) => void;
  end_templater_task?: (path: string) => Promise<void> | void;
}

export interface TemplaterRenderOptions {
  templateFile: TFile | null;
  targetFile: TFile;
  templateSource: string;
}

export function findTemplaterPlugin(app: App): TemplaterPlugin | null {
  const registry = (app as AppWithPluginRegistry).plugins;
  const plugin = registry?.plugins?.[TEMPLATER_PLUGIN_ID];
  if (!isTemplaterPlugin(plugin)) {
    return null;
  }
  if (registry?.enabledPlugins && !enabledPluginsContains(registry.enabledPlugins, TEMPLATER_PLUGIN_ID)) {
    return null;
  }
  return plugin;
}

export async function renderWithTemplater(app: App, options: TemplaterRenderOptions): Promise<string | null> {
  const templater = findTemplaterPlugin(app)?.templater;
  if (!templater || (typeof templater.parse_template !== "function" && typeof templater.read_and_parse_template !== "function")) {
    return null;
  }

  try {
    const config = createTemplaterRunningConfig(app, templater, options);
    const targetPath = options.targetFile.path;
    let taskStarted = false;
    if (targetPath && typeof templater.start_templater_task === "function") {
      templater.start_templater_task(targetPath);
      taskStarted = true;
    }
    try {
      const rendered =
        typeof templater.parse_template === "function"
          ? await templater.parse_template(config, options.templateSource)
          : await templater.read_and_parse_template?.(config);
      return typeof rendered === "string" ? rendered : null;
    } finally {
      if (taskStarted && typeof templater.end_templater_task === "function") {
        await templater.end_templater_task(targetPath);
      }
    }
  } catch (error) {
    console.warn("[Memos Plus] Templater render failed, falling back to Memos Plus template variables", error);
    new Notice("Templater 渲染失败，已使用 Memos Plus 模板变量回退");
    return null;
  }
}

function createTemplaterRunningConfig(app: App, templater: TemplaterRuntime, options: TemplaterRenderOptions): unknown {
  if (typeof templater.create_running_config === "function") {
    return templater.create_running_config(options.templateFile, options.targetFile, TEMPLATER_RUN_MODE_CREATE_NEW_FROM_TEMPLATE);
  }
  return {
    template_file: options.templateFile,
    target_file: options.targetFile,
    run_mode: TEMPLATER_RUN_MODE_CREATE_NEW_FROM_TEMPLATE,
    active_file: app.workspace.getActiveFile()
  };
}

function enabledPluginsContains(enabledPlugins: Set<string> | string[], pluginId: string): boolean {
  return Array.isArray(enabledPlugins) ? enabledPlugins.includes(pluginId) : enabledPlugins.has(pluginId);
}

function isTemplaterPlugin(value: unknown): value is TemplaterPlugin {
  return typeof value === "object" && value !== null && "templater" in value;
}
