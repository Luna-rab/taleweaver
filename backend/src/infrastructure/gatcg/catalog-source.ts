import { z } from "zod";

import type { CatalogFetch, CatalogSource } from "../../application/ports/catalog-source.js";
import type { FetchedCards } from "./client.js";
import { collectSets, toCardSnapshot } from "./mappers.js";
import { cardKeySchema, cardSchema } from "./schemas.js";

/** api.gatcg.com から全カードを取得し、domain のスナップショットに直す。 */
export class GatcgCatalogSource implements CatalogSource {
  readonly #fetchCards: () => Promise<FetchedCards>;

  constructor(fetchCards: () => Promise<FetchedCards>) {
    this.#fetchCards = fetchCards;
  }

  async fetchAll(): Promise<CatalogFetch> {
    return parseCards(await this.#fetchCards());
  }
}

/**
 * 取得したカードの形を確かめる。まず id と slug だけを読み、取得に含まれたカードを記録する。
 * 次に全体を読み、形が合わないカードは飛ばす。飛ばしたカードも含まれたものとして数え、取り下げない。
 */
export function parseCards(fetched: FetchedCards): CatalogFetch {
  const keys = fetched.cards.map((raw) => ({ raw, key: cardKeySchema.safeParse(raw) }));
  const readable = keys.flatMap(({ raw, key }) => (key.success ? [{ raw, key: key.data }] : []));
  const unreadable = keys.length - readable.length;
  // ページを順に取る間に取得元の並びが変わると、同じカードが 2 つのページに出る。
  const unique = [...new Map(readable.map((r) => [r.key.uuid, r])).values()];
  const count = unique.length + unreadable;
  if (count !== fetched.totalCards) {
    throw new Error(
      `取得できたカード（${count} 枚）が取得元の総数（${fetched.totalCards} 枚）と合わない`,
    );
  }

  const parsed = unique.map(({ raw, key }) => ({ key, card: cardSchema.safeParse(raw) }));
  const cards = parsed.flatMap((p) => (p.card.success ? [p.card.data] : []));
  return {
    cards: cards.map(toCardSnapshot),
    sets: collectSets(cards),
    includedCards: unique.map(({ key }) => ({ sourceId: key.uuid, slug: key.slug })),
    skipped: parsed.flatMap((p) =>
      p.card.success ? [] : [{ sourceId: p.key.uuid, issues: z.prettifyError(p.card.error) }],
    ),
    canDecideWithdrawals: unreadable === 0,
  };
}
