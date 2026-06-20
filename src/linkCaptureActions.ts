import { appendTags } from "./linkCapture";

export type LinkCaptureActionResult = "saved" | "clipboard-error" | "no-url";

export interface LinkCaptureStore {
  addMemo(content: string): Promise<void>;
}

export interface LinkCaptureActionSettings {
  linkCaptureDefaultTags: string[];
}

export interface LinkCaptureActionOptions {
  readClipboard: () => Promise<string>;
  resolveMarkdownLink: (clipboardText: string) => Promise<string | null>;
  store: LinkCaptureStore;
  settings: LinkCaptureActionSettings;
  refreshViews: () => Promise<void>;
  notice: (message: string) => void;
}

export async function captureClipboardLinkToMemos(options: LinkCaptureActionOptions): Promise<LinkCaptureActionResult> {
  const markdownLink = await readResolvedMarkdownLink(options);
  if (!markdownLink) {
    return markdownLink === null ? "no-url" : "clipboard-error";
  }

  await options.store.addMemo(appendTags(markdownLink, options.settings.linkCaptureDefaultTags));
  await options.refreshViews();
  return "saved";
}

async function readResolvedMarkdownLink(options: LinkCaptureActionOptions): Promise<string | null | undefined> {
  let clipboardText = "";
  try {
    clipboardText = await options.readClipboard();
  } catch {
    options.notice("无法读取剪贴板，请先复制链接后再运行命令");
    return undefined;
  }

  const markdownLink = await options.resolveMarkdownLink(clipboardText);
  if (!markdownLink) {
    options.notice("剪贴板中没有可收集的链接");
    return null;
  }

  return markdownLink;
}
