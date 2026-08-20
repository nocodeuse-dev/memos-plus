import { Modal, setIcon, type App } from "obsidian";
import type { Language } from "../i18n";
import { learningCardsForFilter, type LearningCard } from "./learningCards";
import type { LearningCardService } from "./learningCardService";
import type { FsrsRating } from "./fsrs";

export class LearningReviewModal extends Modal {
  private readonly queue: LearningCard[];
  private currentIndex = 0;
  private answered = false;

  constructor(app: App, private readonly options: { service: LearningCardService; language: Language; onFinished?: () => void }) {
    super(app);
    this.queue = learningCardsForFilter(options.service.cards(), "today");
  }

  onOpen(): void {
    this.modalEl.addClass("memos-plus-learning-review-shell");
    this.contentEl.addClass("memos-plus-modal", "memos-plus-learning-review");
    void this.renderCard();
  }

  onClose(): void {
    this.options.onFinished?.();
    this.contentEl.empty();
  }

  private async renderCard(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    const lang = this.options.language;
    const card = this.queue[this.currentIndex];
    const header = contentEl.createDiv({ cls: "memos-plus-learning-review-header" });
    header.createEl("span", { text: lang === "zh" ? `今日复习 ${Math.min(this.currentIndex + 1, this.queue.length)} / ${this.queue.length}` : `Today ${Math.min(this.currentIndex + 1, this.queue.length)} / ${this.queue.length}` });
    const exit = header.createEl("button", { attr: { type: "button", "aria-label": lang === "zh" ? "退出复习" : "Exit review" } });
    setIcon(exit, "x");
    exit.addEventListener("click", () => this.close());
    if (!card) {
      contentEl.createEl("h2", { text: lang === "zh" ? "今日复习已完成" : "Today's review is complete" });
      contentEl.createDiv({ cls: "memos-plus-empty", text: lang === "zh" ? "已完成的卡片会按新的间隔再次出现。" : "Reviewed cards will return on their newly scheduled dates." });
      const done = contentEl.createEl("button", { cls: "mod-cta", text: lang === "zh" ? "完成" : "Done", attr: { type: "button" } });
      done.addEventListener("click", () => this.close());
      return;
    }
    const source = await this.options.service.content(card);
    if (!contentEl.isConnected) return;
    contentEl.createEl("h2", { text: lang === "zh" ? "回忆" : "Recall" });
    const cardEl = contentEl.createDiv({ cls: "memos-plus-learning-review-card" });
    cardEl.createDiv({ cls: "memos-plus-learning-review-question", text: questionFor(source.content, card) });
    cardEl.createDiv({ cls: "memos-plus-learning-review-source", text: source.sourceMissing
      ? (lang === "zh" ? "来源已失效 · 显示保存时内容" : "Source unavailable · showing saved content")
      : [card.sourceFile.split("/").pop(), card.sourceHeading].filter(Boolean).join(" · ")
    });
    const answer = cardEl.createDiv({ cls: "memos-plus-learning-review-answer" });
    answer.toggleClass("is-hidden", !this.answered);
    answer.setText(source.content || card.snapshotContent);
    if (!this.answered) {
      const reveal = contentEl.createEl("button", { cls: "mod-cta memos-plus-learning-reveal", text: lang === "zh" ? "显示答案" : "Show answer", attr: { type: "button" } });
      reveal.addEventListener("click", () => {
        this.answered = true;
        void this.renderCard();
      });
      return;
    }
    const ratings = contentEl.createDiv({ cls: "memos-plus-learning-ratings" });
    for (const [rating, label] of ratingLabels(lang)) {
      const button = ratings.createEl("button", { cls: `memos-plus-learning-rating is-${rating}`, text: label, attr: { type: "button" } });
      button.addEventListener("click", () => void this.rate(card, rating, button));
    }
  }

  private async rate(card: LearningCard, rating: FsrsRating, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      await this.options.service.review(card.id, rating);
      this.currentIndex += 1;
      this.answered = false;
      await this.renderCard();
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }
}

function questionFor(content: string, card: LearningCard): string {
  const line = content
    .replace(/^#{1,6}\s+/mu, "")
    .replace(/^[-*+]\s+/mu, "")
    .replace(/#学习(?=$|\s|[，,。；;:：!?！？)）\]】/])/gu, "")
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .find(Boolean);
  return line || card.sourceHeading || card.sourceFile.split("/").pop() || "…";
}

function ratingLabels(language: Language): Array<[FsrsRating, string]> {
  return language === "zh"
    ? [["again", "忘记"], ["hard", "困难"], ["good", "记住"], ["easy", "简单"]]
    : [["again", "Again"], ["hard", "Hard"], ["good", "Good"], ["easy", "Easy"]];
}
