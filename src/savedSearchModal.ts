import { App, Modal, Notice, setIcon } from "obsidian";
import { IconPickerModal, normalizeIconName } from "./iconPicker";
import type { Language } from "./i18n";
import { t } from "./i18n";
import { focusOnDesktopOnly } from "./modalFocus";
import type { MemoItem } from "./markdown";
import {
  createDefaultSavedSearchCondition,
  createSavedSearchId,
  filterMemosBySavedSearch,
  getDefaultOperatorForField,
  getOperatorsForField,
  isBetweenOperator,
  isValidCondition,
  isValueRequired,
  type SavedSearch,
  type SavedSearchCondition,
  type SavedSearchField,
  type SavedSearchOperator,
  type SavedSearchStatus
} from "./savedSearch";
import { createSavedSearchFromTemplate, defaultIconForTemplate, type SavedSearchTemplateId } from "./sidebar";
import {
  TASK_DATE_FIELDS,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
  isTaskDateField,
  type TaskDateField,
  type TaskPriorityFilterValue,
  type TaskStatusFilterValue
} from "./taskSearch";
import type { VaultSearchResult } from "./vaultSearch";

interface SavedSearchModalOptions {
  language: Language;
  memos: MemoItem[];
  tagOptions: string[];
  groups: Array<{ id: string; title: string }>;
  initialSearch?: SavedSearch;
  initialIcon?: string;
  initialGroupId?: string;
  searchVault: (search: SavedSearch) => Promise<VaultSearchResult[]>;
  onSubmit: (search: SavedSearch, meta: SavedSearchModalMeta) => Promise<void>;
}

export interface SavedSearchModalMeta {
  title: string;
  icon: string;
  groupId: string;
}

const FIELDS: SavedSearchField[] = [
  "tag",
  "text",
  "date",
  "status",
  "image",
  "link",
  "task",
  "taskStatus",
  "taskPriority",
  "taskDueDate",
  "taskScheduledDate",
  "taskStartDate",
  "taskCreatedDate",
  "taskDoneDate",
  "taskRecurring",
  "taskOverdue",
  "taskDueToday",
  "taskFuture",
  "year",
  "path"
];
const STATUS_VALUES: SavedSearchStatus[] = ["pinned", "starred", "archived"];
const TASK_DATE_TOKEN_VALUES = ["$today", "$tomorrow", "$thisWeek", "$nextWeek", "$past", "$future", "custom"] as const;
const TEMPLATES: SavedSearchTemplateId[] = ["custom", "pinned", "starred", "today", "week", "todo", "archived", "untagged", "images", "links", "year", "tag"];

export class SavedSearchModal extends Modal {
  private nameInput!: HTMLInputElement;
  private selectedIcon: string;
  private iconPreviewEl!: HTMLElement;
  private iconNameEl!: HTMLElement;
  private groupSelect!: HTMLSelectElement;
  private scopeToggle!: HTMLInputElement;
  private rowsEl!: HTMLElement;
  private countEl!: HTMLElement;
  private previewEl!: HTMLElement;
  private conditions: SavedSearchCondition[];
  private match: SavedSearch["match"];
  private previewRequest = 0;

  constructor(
    app: App,
    private readonly options: SavedSearchModalOptions
  ) {
    super(app);
    this.conditions = options.initialSearch?.conditions.map((condition) => ({ ...condition })) ?? [createDefaultSavedSearchCondition()];
    this.match = options.initialSearch?.match ?? "all";
    this.selectedIcon = normalizeIconName(options.initialIcon, "filter");
  }

  onOpen(): void {
    const { contentEl } = this;
    const lang = this.options.language;
    contentEl.empty();
    this.modalEl.addClass("memos-plus-saved-search-modal-shell");
    contentEl.addClass("memos-plus-modal", "memos-plus-saved-search-modal");
    const header = contentEl.createDiv({ cls: "memos-plus-saved-search-header" });
    const headerIcon = header.createSpan({ cls: "memos-plus-saved-search-header-icon" });
    setIcon(headerIcon, "tag");
    header.createEl("h2", { text: t(lang, this.options.initialSearch ? "savedSearch.editTitle" : "savedSearch.createTitle") });

    const titleWrap = contentEl.createDiv({ cls: "memos-plus-saved-search-title-field" });
    titleWrap.createEl("label", { text: t(lang, "savedSearch.name") });
    this.nameInput = titleWrap.createEl("input", {
      cls: "memos-plus-saved-search-name",
      attr: { type: "text", placeholder: t(lang, "savedSearch.namePlaceholder") }
    });
    this.nameInput.value = this.options.initialSearch?.name ?? "";
    this.nameInput.addEventListener("input", () => this.renderPreview());

    const metaWrap = contentEl.createDiv({ cls: "memos-plus-saved-search-meta-fields" });
    const iconWrap = metaWrap.createDiv({ cls: "memos-plus-saved-search-meta-field" });
    iconWrap.createEl("label", { text: t(lang, "sidebar.icon") });
    const iconControl = iconWrap.createDiv({ cls: "memos-plus-icon-setting-control" });
    this.iconPreviewEl = iconControl.createSpan({ cls: "memos-plus-icon-setting-preview" });
    this.iconNameEl = iconControl.createSpan({ cls: "memos-plus-icon-setting-name" });
    const chooseIcon = iconControl.createEl("button", { text: t(lang, "iconPicker.choose"), attr: { type: "button" } });
    chooseIcon.addEventListener("click", () => {
      new IconPickerModal(this.app, {
        language: lang,
        selectedIcon: this.selectedIcon,
        onChoose: (icon) => {
          this.selectedIcon = icon;
          this.renderSelectedIcon();
        }
      }).open();
    });
    this.renderSelectedIcon();

    const groupWrap = metaWrap.createDiv({ cls: "memos-plus-saved-search-meta-field" });
    groupWrap.createEl("label", { text: t(lang, "sidebar.group") });
    this.groupSelect = groupWrap.createEl("select", { cls: "memos-plus-saved-search-input" });
    this.groupSelect.createEl("option", { value: "", text: t(lang, "sidebar.root") });
    for (const group of this.options.groups) {
      this.groupSelect.createEl("option", { value: group.id, text: group.title });
    }
    this.groupSelect.value = this.options.initialGroupId ?? "";

    const scopeWrap = contentEl.createDiv({ cls: "memos-plus-saved-search-scope" });
    const scopeLabel = scopeWrap.createEl("label");
    this.scopeToggle = scopeLabel.createEl("input", { attr: { type: "checkbox" } });
    this.scopeToggle.checked = this.options.initialSearch?.searchScope === "vault";
    scopeLabel.createSpan({ text: t(lang, "savedSearch.searchEntireVault") });
    scopeWrap.createDiv({ cls: "memos-plus-saved-search-scope-desc", text: t(lang, "savedSearch.searchEntireVaultDesc") });
    this.scopeToggle.addEventListener("change", () => this.renderPreview());

    this.renderTemplatePicker(contentEl);

    contentEl.createDiv({ cls: "memos-plus-saved-search-subtitle", text: t(lang, "savedSearch.filters") });
    this.rowsEl = contentEl.createDiv({ cls: "memos-plus-saved-search-rows" });
    this.renderConditionRows();

    const addCondition = contentEl.createEl("button", { cls: "memos-plus-saved-search-add", text: t(lang, "savedSearch.addCondition") });
    addCondition.addEventListener("click", () => {
      this.conditions.push(createDefaultSavedSearchCondition());
      this.renderConditionRows();
      this.renderPreview();
    });

    const previewHeader = contentEl.createDiv({ cls: "memos-plus-saved-search-preview-header" });
    previewHeader.createSpan({ text: t(lang, "savedSearch.preview") });
    this.previewEl = contentEl.createDiv({ cls: "memos-plus-saved-search-preview" });
    const footer = contentEl.createDiv({ cls: "memos-plus-saved-search-footer" });
    this.countEl = footer.createSpan({ cls: "memos-plus-saved-search-count" });
    const save = footer.createEl("button", { cls: "memos-plus-save-button", text: t(lang, "modal.save") });
    save.addEventListener("click", () => {
      void this.submit();
    });
    this.renderPreview();

    focusOnDesktopOnly(this.nameInput);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderConditionRows(): void {
    const lang = this.options.language;
    this.rowsEl.empty();
    this.conditions.forEach((condition, index) => {
      const row = this.rowsEl.createDiv({ cls: "memos-plus-saved-search-row" });
      const join = row.createDiv({ cls: "memos-plus-saved-search-join" });
      if (index > 0) {
        const match = join.createEl("select", { cls: "memos-plus-saved-search-match" });
        match.createEl("option", { text: t(lang, "savedSearch.match.all"), value: "all" });
        match.createEl("option", { text: t(lang, "savedSearch.match.any"), value: "any" });
        match.value = this.match;
        match.addEventListener("change", () => {
          this.match = match.value === "any" ? "any" : "all";
          this.renderConditionRows();
          this.renderPreview();
        });
      }
      const field = row.createEl("select", { cls: "memos-plus-saved-search-select" });
      for (const item of FIELDS) {
        field.createEl("option", { text: t(lang, `savedSearch.field.${item}`), value: item });
      }
      field.value = condition.field;
      field.addEventListener("change", () => {
        const nextField = field.value as SavedSearchField;
        this.conditions[index] = conditionForField(nextField);
        this.renderConditionRows();
        this.renderPreview();
      });

      const operator = row.createEl("select", { cls: "memos-plus-saved-search-select" });
      for (const item of getOperatorsForField(condition.field)) {
        operator.createEl("option", { text: t(lang, `savedSearch.operator.${item}`), value: item });
      }
      operator.value = condition.operator;
      operator.addEventListener("change", () => {
        const nextOperator = operator.value as SavedSearchOperator;
        this.conditions[index] = normalizeConditionForOperator({ ...condition, operator: nextOperator });
        this.renderConditionRows();
        this.renderPreview();
      });

      const valueHost = row.createDiv({ cls: "memos-plus-saved-search-value" });
      this.renderValueInput(valueHost, condition, index);

      const remove = row.createEl("button", {
        cls: "memos-plus-icon-button",
        attr: { type: "button", "aria-label": t(lang, "savedSearch.removeCondition"), title: t(lang, "savedSearch.removeCondition") }
      });
      setIcon(remove, "x");
      remove.addEventListener("click", () => {
        this.conditions.splice(index, 1);
        if (this.conditions.length === 0) {
          this.conditions.push(createDefaultSavedSearchCondition());
        }
        this.renderConditionRows();
        this.renderPreview();
      });
    });
  }

  private renderTemplatePicker(contentEl: HTMLElement): void {
    const lang = this.options.language;
    if (this.options.initialSearch) {
      return;
    }
    const wrap = contentEl.createDiv({ cls: "memos-plus-saved-search-template" });
    wrap.createEl("label", { text: t(lang, "savedSearch.template") });
    const select = wrap.createEl("select", { cls: "memos-plus-saved-search-input" });
    for (const template of TEMPLATES) {
      select.createEl("option", { text: t(lang, `savedSearch.template.${template}`), value: template });
    }
    const value = wrap.createEl("input", {
      cls: "memos-plus-saved-search-input",
      attr: { type: "text", placeholder: t(lang, "savedSearch.templateValue") }
    });
    value.addClass("is-hidden");
    const apply = wrap.createEl("button", { cls: "memos-plus-search-create", text: t(lang, "savedSearch.applyTemplate"), attr: { type: "button" } });

    const syncValueVisibility = (): void => {
      const needsValue = select.value === "year" || select.value === "tag";
      value.toggleClass("is-hidden", !needsValue);
    };
    select.addEventListener("change", syncValueVisibility);
    apply.addEventListener("click", () => {
      const template = select.value as SavedSearchTemplateId;
      const next = createSavedSearchFromTemplate(template, { value: value.value });
      this.conditions = next.conditions.map((condition) => ({ ...condition }));
      this.match = next.match;
      if (!this.nameInput.value.trim()) {
        this.nameInput.value = next.name;
      }
      this.selectedIcon = defaultIconForTemplate(template);
      this.renderSelectedIcon();
      this.renderConditionRows();
      this.renderPreview();
    });
    syncValueVisibility();
  }

  private renderValueInput(host: HTMLElement, condition: SavedSearchCondition, index: number): void {
    const lang = this.options.language;
    if (!isValueRequired(condition.operator)) {
      host.createSpan({ cls: "memos-plus-saved-search-value-muted", text: t(lang, "savedSearch.noValue") });
      return;
    }
    if (condition.field === "tag") {
      this.renderTagInput(host, condition, index);
      return;
    }
    if (condition.field === "status") {
      const select = host.createEl("select", { cls: "memos-plus-saved-search-input" });
      for (const status of STATUS_VALUES) {
        select.createEl("option", { text: t(lang, `savedSearch.status.${status}`), value: status });
      }
      select.value = condition.value && STATUS_VALUES.includes(condition.value as SavedSearchStatus) ? condition.value : "pinned";
      select.addEventListener("change", () => {
        this.conditions[index] = { ...condition, value: select.value };
        this.renderPreview();
      });
      return;
    }
    if (condition.field === "taskStatus") {
      const select = host.createEl("select", { cls: "memos-plus-saved-search-input" });
      for (const status of TASK_STATUS_VALUES) {
        select.createEl("option", { text: t(lang, `savedSearch.taskStatus.${status}`), value: status });
      }
      select.value = TASK_STATUS_VALUES.includes(condition.value as TaskStatusFilterValue) ? condition.value ?? "open" : "open";
      select.addEventListener("change", () => {
        this.conditions[index] = { ...condition, value: select.value };
        this.renderPreview();
      });
      return;
    }
    if (condition.field === "taskPriority") {
      const select = host.createEl("select", { cls: "memos-plus-saved-search-input" });
      for (const priority of TASK_PRIORITY_VALUES) {
        select.createEl("option", { text: t(lang, `savedSearch.taskPriority.${priority}`), value: priority });
      }
      select.value = TASK_PRIORITY_VALUES.includes(condition.value as TaskPriorityFilterValue) ? condition.value ?? "high" : "high";
      select.addEventListener("change", () => {
        this.conditions[index] = { ...condition, value: select.value };
        this.renderPreview();
      });
      return;
    }
    if (isTaskDateField(condition.field)) {
      this.renderTaskDateInput(host, condition, index, condition.field);
      return;
    }
    if (condition.field === "date") {
      const start = host.createEl("input", { cls: "memos-plus-saved-search-input", attr: { type: "date" } });
      start.value = condition.value ?? "";
      start.addEventListener("input", () => {
        this.conditions[index] = { ...this.conditions[index], value: start.value };
        this.renderPreview();
      });
      if (isBetweenOperator(condition.operator)) {
        const end = host.createEl("input", { cls: "memos-plus-saved-search-input", attr: { type: "date" } });
        end.value = condition.valueTo ?? "";
        end.addEventListener("input", () => {
          this.conditions[index] = { ...this.conditions[index], valueTo: end.value };
          this.renderPreview();
        });
      }
      return;
    }
    const input = host.createEl("input", {
      cls: "memos-plus-saved-search-input",
      attr: { type: "text", placeholder: t(lang, `savedSearch.placeholder.${condition.field}`) }
    });
    input.value = condition.value ?? "";
    input.addEventListener("input", () => {
      this.conditions[index] = { ...condition, value: input.value };
      this.renderPreview();
    });
  }

  private renderTaskDateInput(host: HTMLElement, condition: SavedSearchCondition, index: number, field: TaskDateField): void {
    const lang = this.options.language;
    if (condition.operator === "before" || condition.operator === "after") {
      const date = host.createEl("input", { cls: "memos-plus-saved-search-input", attr: { type: "date" } });
      date.value = isIsoDate(condition.value) ? condition.value ?? "" : "";
      date.addEventListener("input", () => {
        this.conditions[index] = { ...this.conditions[index], value: date.value };
        this.renderPreview();
      });
      return;
    }
    if (isBetweenOperator(condition.operator)) {
      const start = host.createEl("input", { cls: "memos-plus-saved-search-input", attr: { type: "date" } });
      start.value = isIsoDate(condition.value) ? condition.value ?? "" : "";
      start.addEventListener("input", () => {
        this.conditions[index] = { ...this.conditions[index], value: start.value };
        this.renderPreview();
      });
      const end = host.createEl("input", { cls: "memos-plus-saved-search-input", attr: { type: "date" } });
      end.value = isIsoDate(condition.valueTo) ? condition.valueTo ?? "" : "";
      end.addEventListener("input", () => {
        this.conditions[index] = { ...this.conditions[index], valueTo: end.value };
        this.renderPreview();
      });
      return;
    }

    const select = host.createEl("select", { cls: "memos-plus-saved-search-input" });
    const selected = TASK_DATE_TOKEN_VALUES.includes(condition.value as (typeof TASK_DATE_TOKEN_VALUES)[number]) ? condition.value ?? "$today" : "custom";
    for (const token of TASK_DATE_TOKEN_VALUES) {
      select.createEl("option", { text: t(lang, `savedSearch.taskDate.${token === "custom" ? "custom" : token.slice(1)}`), value: token });
    }
    select.value = selected;
    const date = host.createEl("input", { cls: "memos-plus-saved-search-input", attr: { type: "date" } });
    date.value = selected === "custom" && isIsoDate(condition.value) ? condition.value ?? "" : "";
    date.toggleClass("is-hidden", selected !== "custom");
    select.addEventListener("change", () => {
      const nextValue = select.value === "custom" ? date.value : select.value;
      date.toggleClass("is-hidden", select.value !== "custom");
      this.conditions[index] = { ...this.conditions[index], field, value: nextValue };
      this.renderPreview();
    });
    date.addEventListener("input", () => {
      this.conditions[index] = { ...this.conditions[index], field, value: date.value };
      this.renderPreview();
    });
  }

  private renderTagInput(host: HTMLElement, condition: SavedSearchCondition, index: number): void {
    const lang = this.options.language;
    const wrapper = host.createDiv({ cls: "memos-plus-saved-search-tag-input" });
    const input = wrapper.createEl("input", {
      cls: "memos-plus-saved-search-input",
      attr: { type: "text", placeholder: t(lang, "savedSearch.placeholder.tag") }
    });
    input.value = condition.value ?? "";
    const suggestions = wrapper.createDiv({ cls: "memos-plus-saved-search-tag-suggestions" });

    const renderSuggestions = (): void => {
      suggestions.empty();
      const query = input.value.trim().toLowerCase();
      const matches = this.options.tagOptions
        .filter((tag) => !query || tag.toLowerCase().includes(query))
        .slice(0, 10);
      if (matches.length === 0) {
        suggestions.createDiv({ cls: "memos-plus-saved-search-tag-empty", text: t(lang, "savedSearch.noTagOptions") });
        return;
      }
      for (const tag of matches) {
        const item = suggestions.createEl("button", { cls: "memos-plus-saved-search-tag-option", text: `#${tag}`, attr: { type: "button" } });
        item.addEventListener("mousedown", (event) => {
          event.preventDefault();
          input.value = tag;
          this.conditions[index] = { ...condition, value: tag };
          this.renderPreview();
          suggestions.removeClass("is-open");
        });
      }
    };

    input.addEventListener("focus", () => {
      renderSuggestions();
      suggestions.addClass("is-open");
    });
    input.addEventListener("blur", () => {
      setTimeout(() => suggestions.removeClass("is-open"), 120);
    });
    input.addEventListener("input", () => {
      this.conditions[index] = { ...condition, value: input.value };
      renderSuggestions();
      suggestions.addClass("is-open");
      this.renderPreview();
    });
  }

  private renderPreview(): void {
    const requestId = ++this.previewRequest;
    void this.renderPreviewAsync(requestId);
  }

  private async renderPreviewAsync(requestId: number): Promise<void> {
    const lang = this.options.language;
    const search = this.buildSearch();
    if (search.searchScope === "vault") {
      const matches = search.conditions.length > 0 ? await this.options.searchVault(search) : [];
      if (requestId !== this.previewRequest) {
        return;
      }
      this.countEl.setText(t(lang, "savedSearch.vaultMatchCount").replace("{count}", String(matches.length)));
      this.previewEl.empty();
      if (matches.length === 0) {
        this.previewEl.createDiv({ cls: "memos-plus-saved-search-empty", text: t(lang, "savedSearch.noVaultPreview") });
        return;
      }
      for (const result of matches.slice(0, 8)) {
        const item = this.previewEl.createDiv({ cls: "memos-plus-saved-search-preview-item" });
        item.createDiv({ cls: "memos-plus-saved-search-preview-time", text: result.path });
        item.createDiv({ cls: "memos-plus-saved-search-preview-text", text: result.task?.text ?? result.title });
        if (result.task) {
          item.createDiv({ cls: "memos-plus-saved-search-preview-time", text: formatTaskSummary(result.task, lang) });
        }
      }
      return;
    }

    const matches = search.conditions.length > 0 ? filterMemosBySavedSearch(this.options.memos, search) : [];
    if (requestId !== this.previewRequest) {
      return;
    }
    this.countEl.setText(t(lang, "savedSearch.matchCount").replace("{count}", String(matches.length)));
    this.previewEl.empty();
    if (matches.length === 0) {
      this.previewEl.createDiv({ cls: "memos-plus-saved-search-empty", text: t(lang, "savedSearch.noPreview") });
      return;
    }
    for (const memo of matches.slice(0, 8)) {
      const item = this.previewEl.createDiv({ cls: "memos-plus-saved-search-preview-item" });
      item.createDiv({ cls: "memos-plus-saved-search-preview-time", text: `${memo.date} ${memo.time}` });
      item.createDiv({ cls: "memos-plus-saved-search-preview-text", text: firstLine(memo.content) });
    }
  }

  private buildSearch(): SavedSearch {
    return {
      id: this.options.initialSearch?.id ?? createSavedSearchId(),
      name: this.nameInput?.value.trim() || t(this.options.language, "savedSearch.untitled"),
      match: this.match,
      searchScope: this.scopeToggle?.checked ? "vault" : "memos",
      conditions: this.conditions.filter(isValidCondition)
    };
  }

  private async submit(): Promise<void> {
    const lang = this.options.language;
    const search = this.buildSearch();
    if (!this.nameInput.value.trim()) {
      new Notice(t(lang, "savedSearch.nameRequired"));
      return;
    }
    if (search.conditions.length === 0) {
      new Notice(t(lang, "savedSearch.conditionRequired"));
      return;
    }
    await this.options.onSubmit(
      { ...search, name: this.nameInput.value.trim() },
      {
        title: this.nameInput.value.trim(),
        icon: normalizeIconName(this.selectedIcon, "filter"),
        groupId: this.groupSelect.value
      }
    );
    this.close();
  }

  private renderSelectedIcon(): void {
    const icon = normalizeIconName(this.selectedIcon, "filter");
    this.iconPreviewEl.empty();
    setIcon(this.iconPreviewEl, icon);
    this.iconNameEl.setText(icon);
  }
}

function conditionForField(field: SavedSearchField): SavedSearchCondition {
  const operator = getDefaultOperatorForField(field);
  return normalizeConditionForOperator({
    field,
    operator,
    value: defaultValueForField(field)
  });
}

function normalizeConditionForOperator(condition: SavedSearchCondition): SavedSearchCondition {
  if (!isValueRequired(condition.operator)) {
    return { field: condition.field, operator: condition.operator };
  }
  if (condition.field === "status") {
    return { ...condition, value: condition.value || "pinned" };
  }
  if (condition.field === "taskStatus") {
    return { ...condition, value: condition.value || "open" };
  }
  if (condition.field === "taskPriority") {
    return { ...condition, value: condition.value || "high" };
  }
  if (isTaskDateField(condition.field) && (condition.operator === "equals" || condition.operator === "notEquals")) {
    return { ...condition, value: condition.value || "$today" };
  }
  return condition;
}

function firstLine(content: string): string {
  return content.split("\n").find((line) => line.trim())?.trim() ?? "";
}

function formatTaskSummary(task: NonNullable<VaultSearchResult["task"]>, lang: Language): string {
  return [
    t(lang, `savedSearch.taskStatus.${task.completed ? "completed" : "open"}`),
    task.priority !== "none" ? t(lang, `savedSearch.taskPriority.${task.priority}`) : "",
    task.dueDate ? `📅 ${task.dueDate}` : ""
  ]
    .filter(Boolean)
    .join(" · ");
}

function defaultValueForField(field: SavedSearchField): string {
  if (field === "status") {
    return "pinned";
  }
  if (field === "taskStatus") {
    return "open";
  }
  if (field === "taskPriority") {
    return "high";
  }
  if ((TASK_DATE_FIELDS as readonly string[]).includes(field)) {
    return "$today";
  }
  return "";
}

function isIsoDate(value: string | undefined): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");
}
