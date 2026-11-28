import type { CardSetId } from "../value-objects/card-set-id.js";
import type { SourceId } from "../value-objects/source-id.js";

/** CardSet 集約の repository。Card 集約が使うのはセットの id を引く操作だけ。 */
export interface CardSetRepository {
  findIdBySourceId(sourceId: SourceId): Promise<CardSetId | null>;
}
