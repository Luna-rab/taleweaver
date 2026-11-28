import type { CardSet } from "../aggregates/card-set/entities/card-set.js";
import type { CardSetId } from "../value-objects/card-set-id.js";
import type { CardSetPrefix } from "../value-objects/card-set-prefix.js";
import type { SourceId } from "../value-objects/source-id.js";

export interface CardSetRepository {
  findBySourceId(sourceId: SourceId): Promise<CardSet | null>;
  findByPrefix(prefix: CardSetPrefix): Promise<CardSet | null>;
  /** Card 集約が、エディションのセットを引くのに使う。 */
  findIdBySourceId(sourceId: SourceId): Promise<CardSetId | null>;
  /** セットを id を鍵に upsert する。 */
  save(cardSet: CardSet): Promise<void>;
}
