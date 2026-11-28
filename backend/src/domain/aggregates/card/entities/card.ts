import type { CardId } from "../../../value-objects/card-id.js";
import type { CardReference } from "../../../value-objects/card-reference.js";
import type { Legality } from "../../../value-objects/legality.js";
import type { Ruling } from "../../../value-objects/ruling.js";
import type { CardEdition } from "./card-edition.js";
import type { CardFace } from "./card-face.js";

/**
 * カード集約のルート。id で区別し、sourceId・効果文・裁定が変わっても同じカードとして追う。
 * デッキが id で参照するので、取得元から消えても行を残す。
 */
export type Card = {
  readonly id: CardId;
  /** 楽観ロックの版番号。集約は書き換えず、repository の save が読んだときの版と比べて 1 上げる。 */
  readonly version: number;
  readonly front: CardFace;
  /** 片面のカードは null。 */
  readonly back: CardFace | null;
  readonly legality: Legality;
  /** 取得元の並び順のまま持つ。 */
  readonly rulings: readonly Ruling[];
  readonly references: readonly CardReference[];
  /** 表の面の sourceId の順。取得元の並び順が変わっただけで「変わった」と判定しないため。 */
  readonly editions: readonly CardEdition[];
  /** 取得元から消えた時刻。 */
  readonly withdrawnAt: Date | null;
};
