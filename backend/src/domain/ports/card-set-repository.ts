import type { CardSet } from "../aggregates/card-set/entities/card-set.js";
import type { CardSetId } from "../value-objects/card-set-id.js";
import type { CardSetPrefix } from "../value-objects/card-set-prefix.js";
import type { SourceId } from "../value-objects/source-id.js";

export interface CardSetRepository {
  findBySourceId(sourceId: SourceId): Promise<CardSet | null>;
  findByPrefix(prefix: CardSetPrefix): Promise<CardSet | null>;
  /** Card 集約が、エディションのセットを引くのに使う。 */
  findIdBySourceId(sourceId: SourceId): Promise<CardSetId | null>;
  /**
   * セットを保存し、版を 1 上げる。version が 0 なら新しいセットとして版 1 で追加する。
   * それ以外は保存済みの版が cardSet.version のときだけ書き換え、違えば OptimisticLockError を投げる。
   */
  save(cardSet: CardSet): Promise<void>;
}
