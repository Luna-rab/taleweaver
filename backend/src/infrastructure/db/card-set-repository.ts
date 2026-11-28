import { and, eq, sql } from "drizzle-orm";

import { cardSets } from "../../db/schema.js";
import type { CardSet } from "../../domain/aggregates/card-set/entities/card-set.js";
import type { CardSetRepository } from "../../domain/ports/card-set-repository.js";
import { OptimisticLockError } from "../../domain/ports/optimistic-lock-error.js";
import type { CalendarDate } from "../../domain/value-objects/calendar-date.js";
import type { CardSetId } from "../../domain/value-objects/card-set-id.js";
import type { CardSetLanguage } from "../../domain/value-objects/card-set-language.js";
import type { CardSetName } from "../../domain/value-objects/card-set-name.js";
import type { CardSetPrefix } from "../../domain/value-objects/card-set-prefix.js";
import type { SourceId } from "../../domain/value-objects/source-id.js";
import type { Tx } from "./client.js";

type Row = typeof cardSets.$inferSelect;

export class DrizzleCardSetRepository implements CardSetRepository {
  readonly #tx: Tx;

  constructor(tx: Tx) {
    this.#tx = tx;
  }

  async findBySourceId(sourceId: SourceId): Promise<CardSet | null> {
    const [row] = await this.#tx.select().from(cardSets).where(eq(cardSets.sourceId, sourceId));
    return row === undefined ? null : toCardSet(row);
  }

  async findByPrefix(prefix: CardSetPrefix): Promise<CardSet | null> {
    const [row] = await this.#tx.select().from(cardSets).where(eq(cardSets.prefix, prefix));
    return row === undefined ? null : toCardSet(row);
  }

  async findIdBySourceId(sourceId: SourceId): Promise<CardSetId | null> {
    const [row] = await this.#tx
      .select({ id: cardSets.id })
      .from(cardSets)
      .where(eq(cardSets.sourceId, sourceId));
    return row === undefined ? null : (row.id as CardSetId);
  }

  async save(cardSet: CardSet): Promise<void> {
    const values = {
      sourceId: cardSet.sourceId,
      prefix: cardSet.prefix,
      name: cardSet.name,
      language: cardSet.language,
      releaseDate: cardSet.releaseDate,
      sourceUpdatedAt: cardSet.sourceUpdatedAt,
    };
    if (cardSet.version === 0) {
      await this.#tx.insert(cardSets).values({ id: cardSet.id, version: 1, ...values });
      return;
    }
    const updated = await this.#tx
      .update(cardSets)
      .set({ ...values, version: sql`${cardSets.version} + 1` })
      .where(and(eq(cardSets.id, cardSet.id), eq(cardSets.version, cardSet.version)))
      .returning({ id: cardSets.id });
    if (updated.length === 0) throw new OptimisticLockError("セット", cardSet.id, cardSet.version);
  }
}

// DB の値は保存する前に集約が確かめているので、value object の検証を通さずに型だけを付ける。
function toCardSet(row: Row): CardSet {
  return {
    id: row.id as CardSetId,
    version: row.version,
    sourceId: row.sourceId as SourceId,
    prefix: row.prefix as CardSetPrefix,
    name: row.name as CardSetName,
    language: row.language as CardSetLanguage,
    releaseDate: row.releaseDate as CalendarDate | null,
    sourceUpdatedAt: row.sourceUpdatedAt,
  };
}
