import type { CardSetId } from "../../value-objects/card-set-id.js";
import type { CardSetPrefix } from "../../value-objects/card-set-prefix.js";
import type { SourceId } from "../../value-objects/source-id.js";
import type { CardSet } from "./entities/card-set.js";

/** CardSet 集約が判断のために必要とする操作。application が ports の実装から組み立てて渡す。 */
export type CardSetOperations = {
  findBySourceId(sourceId: SourceId): Promise<CardSet | null>;
  findByPrefix(prefix: CardSetPrefix): Promise<CardSet | null>;
  /**
   * その sourceId のセットが、今回の取得に含まれているか。
   * 略号で照合したとき、元の sourceId が取得にまだ残っていれば、id の振り直しではないと判断するのに使う。
   */
  isInCurrentFetch(sourceId: SourceId): Promise<boolean>;
  newCardSetId(): CardSetId;
};
