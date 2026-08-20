import type { App } from "obsidian";
import {
  createLearningCard,
  hasLearningTag,
  learningCardsForFilter,
  learningCardStats,
  normalizeLearningCards,
  resolveLearningCardContent,
  scheduleLearningCard,
  type LearningCard,
  type LearningCardContent,
  type LearningCardFilter,
  type LearningCardSource,
  type LearningCardStats
} from "./learningCards";
import type { FsrsRating } from "./fsrs";

/** Keeps persisted card state small and separate from rendering concerns. */
export class LearningCardService {
  constructor(
    private readonly app: App,
    private readonly getCards: () => LearningCard[],
    private readonly replaceCards: (cards: LearningCard[]) => Promise<void>
  ) {}

  cards(): LearningCard[] {
    return normalizeLearningCards(this.getCards());
  }

  stats(now = new Date()): LearningCardStats {
    return learningCardStats(this.cards(), now);
  }

  forFilter(filter: LearningCardFilter, now = new Date()): LearningCard[] {
    return learningCardsForFilter(this.cards(), filter, now);
  }

  async createFromCollectedContent(source: LearningCardSource): Promise<LearningCard | null> {
    if (!hasLearningTag(source.content)) return null;
    const card = createLearningCard(source);
    const cards = this.cards();
    const existing = cards.find((item) => item.id === card.id);
    // Collection may be retried after the Markdown write has already succeeded.
    // Treat an existing source card as a no-op so a second send never claims it
    // created another card or adds duplicate review state.
    if (existing) return null;
    await this.replaceCards([...cards, card]);
    return card;
  }

  async review(cardId: string, rating: FsrsRating, now = new Date()): Promise<LearningCard | null> {
    let updated: LearningCard | null = null;
    const cards = this.cards().map((card) => {
      if (card.id !== cardId) return card;
      updated = scheduleLearningCard(card, rating, now);
      return updated;
    });
    if (!updated) return null;
    await this.replaceCards(cards);
    return updated;
  }

  async content(card: LearningCard): Promise<LearningCardContent> {
    return resolveLearningCardContent(this.app, card);
  }
}
