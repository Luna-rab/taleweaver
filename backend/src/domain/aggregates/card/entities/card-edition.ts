import type { CardEditionId } from "../../../value-objects/card-edition-id.js";
import type { CardSetId } from "../../../value-objects/card-set-id.js";
import type { CollectorNumber } from "../../../value-objects/collector-number.js";
import type { Rarity } from "../../../value-objects/rarity.js";
import type { CardEditionFace } from "./card-edition-face.js";

/**
 * カードの刷り（セット・番号・レアリティごと）。id で区別し、取得元から消えても行を残す。
 * 将来はコレクション機能が id で参照する。
 */
export type CardEdition = {
  readonly id: CardEditionId;
  readonly setId: CardSetId;
  readonly collectorNumber: CollectorNumber;
  readonly rarity: Rarity;
  /** 取り下げたエディションは既定にしない。既定のエディションがないカードも実在する。 */
  readonly isDefault: boolean;
  /** 取得元から消えた時刻。 */
  readonly withdrawnAt: Date | null;
  readonly front: CardEditionFace;
  /** 片面のカードのエディションは null。 */
  readonly back: CardEditionFace | null;
};
