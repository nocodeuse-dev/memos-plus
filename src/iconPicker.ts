import { App, Modal, Platform, getIconIds, setIcon } from "obsidian";
import type { IconName } from "obsidian";
import type { Language } from "./i18n";
import { t } from "./i18n";
import { focusOnDesktopOnly } from "./modalFocus";
import { registerMemosPlusModalClose, registerMemosPlusModalOpen } from "./mobileModalSafety";
import { debounce, DESKTOP_DEBOUNCE_MS, iconPickerResultLimit, MOBILE_DEBOUNCE_MS } from "./performance";

export interface IconPickerModalOptions {
  language: Language;
  selectedIcon: string;
  onChoose: (icon: string) => void;
}

const FALLBACK_ICONS = [
  "layout-grid",
  "folder",
  "filter",
  "check-square",
  "list-checks",
  "tag",
  "calendar",
  "calendar-days",
  "star",
  "pin",
  "archive",
  "image",
  "link",
  "book-open",
  "file-text",
  "bookmark",
  "inbox",
  "lightbulb",
  "clipboard-list",
  "message-square-plus"
];

export class IconPickerModal extends Modal {
  private query = "";
  private listEl!: HTMLElement;
  private readonly icons: string[];

  constructor(
    app: App,
    private readonly options: IconPickerModalOptions
  ) {
    super(app);
    this.icons = getAvailableIconIds();
  }

  onOpen(): void {
    registerMemosPlusModalOpen(this, "IconPickerModal");
    const lang = this.options.language;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("memos-plus-modal", "memos-plus-icon-picker-modal");
    contentEl.createEl("h2", { text: t(lang, "iconPicker.title") });
    const search = contentEl.createEl("input", {
      cls: "memos-plus-icon-picker-search",
      attr: { type: "search", placeholder: t(lang, "iconPicker.searchPlaceholder") }
    });
    const renderDebounced = debounce(() => this.renderList(), Platform.isMobile ? MOBILE_DEBOUNCE_MS : DESKTOP_DEBOUNCE_MS);
    search.addEventListener("input", () => {
      this.query = search.value;
      renderDebounced();
    });
    this.listEl = contentEl.createDiv({ cls: "memos-plus-icon-picker-list" });
    this.renderList();
    focusOnDesktopOnly(search);
  }

  onClose(): void {
    registerMemosPlusModalClose(this, "IconPickerModal");
    this.contentEl.empty();
  }

  private renderList(): void {
    const lang = this.options.language;
    this.listEl.empty();
    const matches = filterIconIds(this.icons, this.query).slice(0, iconPickerResultLimit(Platform.isMobile));
    if (matches.length === 0) {
      this.listEl.createDiv({ cls: "memos-plus-icon-picker-empty", text: t(lang, "iconPicker.empty") });
      return;
    }
    for (const icon of matches) {
      const row = this.listEl.createEl("button", {
        cls: `memos-plus-icon-picker-row${icon === this.options.selectedIcon ? " is-selected" : ""}`,
        attr: { type: "button" }
      });
      const preview = row.createSpan({ cls: "memos-plus-icon-picker-preview" });
      setIcon(preview, icon as IconName);
      row.createSpan({ cls: "memos-plus-icon-picker-name", text: icon });
      row.addEventListener("click", () => {
        this.options.onChoose(icon);
        this.close();
      });
    }
  }
}

export function filterIconIds(iconIds: string[], query: string): string[] {
  const normalized = query.trim().toLowerCase();
  const sorted = [...iconIds].sort((left, right) => left.localeCompare(right));
  if (normalized) {
    return sorted.filter((icon) => icon.toLowerCase().includes(normalized));
  }
  const iconSet = new Set(iconIds);
  return FALLBACK_ICONS.filter((icon) => iconSet.has(icon));
}

export function normalizeIconName(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getAvailableIconIds(): string[] {
  const ids = getIconIds();
  return ids.length > 0 ? ids : FALLBACK_ICONS;
}
