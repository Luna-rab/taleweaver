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
  /** 表、裏の順。片面のカードは表だけ。 */
  readonly faces: readonly CardFace[];
  readonly legality: Legality;
  /** 取得元の並び順のまま持つ。 */
  readonly rulings: readonly Ruling[];
  readonly references: readonly CardReference[];
  /** 表の面の sourceId の順。取得元の並び順が変わっただけで「変わった」と判定しないため。 */
  readonly editions: readonly CardEdition[];
  /** 取得元から消えた時刻。 */
  readonly withdrawnAt: Date | null;
};

export function frontFace(card: { readonly faces: readonly CardFace[] }): CardFace {
  const face = card.faces.find((f) => f.side === "front");
  if (!face) throw new Error("表の面がないカードの状態は作れない");
  return face;
}
