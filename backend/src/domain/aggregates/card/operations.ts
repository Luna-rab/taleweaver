import type { CardEditionId } from "../../value-objects/card-edition-id.js";
import type { CardId } from "../../value-objects/card-id.js";
import type { CardSetId } from "../../value-objects/card-set-id.js";
import type { Slug } from "../../value-objects/slug.js";
import type { SourceId } from "../../value-objects/source-id.js";
import type { Card } from "./entities/card.js";

/**
 * Card 集約が判断のために必要とする操作。application が ports の実装から組み立てて渡す。
 * 集約は必要になった分岐でだけ呼ぶ（例: sourceId で見つかれば findByFrontSlug は呼ばない）。
 * どれも業務上の結果だけを返し、DB の障害などは例外で投げる。
 */
export type CardOperations = {
  findById(id: CardId): Promise<Card | null>;
  /** 表の面の sourceId でカードを引く。取り下げたカードも返す。 */
  findByFrontSourceId(sourceId: SourceId): Promise<Card | null>;
  /** 表の面の slug でカードを引く。取り下げたカードも返す。 */
  findByFrontSlug(slug: Slug): Promise<Card | null>;
  /**
   * その sourceId のカードが、今回の取得に含まれているか。
   * slug で照合したとき、元の sourceId が取得にまだ残っていれば、id の振り直しではないと判断するのに使う。
   */
  isInCurrentFetch(frontSourceId: SourceId): Promise<boolean>;
  findSetIdBySourceId(sourceId: SourceId): Promise<CardSetId | null>;
  /** 主キーは保存の前に決める。イベントに id を載せるため。 */
  newCardId(): CardId;
  newCardEditionId(): CardEditionId;
};
