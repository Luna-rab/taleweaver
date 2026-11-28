import type { CardCharacteristics } from "../../value-objects/card-characteristics.js";
import type { CardEditionId } from "../../value-objects/card-edition-id.js";
import type { CardId } from "../../value-objects/card-id.js";
import type { CardReference } from "../../value-objects/card-reference.js";
import type { FaceSide } from "../../value-objects/face-side.js";
import type { ImageId } from "../../value-objects/image-id.js";
import type { Ruling } from "../../value-objects/ruling.js";
import type { CardEdition } from "./entities/card-edition.js";
import type { CardFace } from "./entities/card-face.js";

// イベントは状態を変えた事実だけを表す。
// 状態の変化はどれも、いずれかのイベントで表す（購読する処理がまだないイベントもある）。
// 1 回のコマンドで、変わった部分ごとに複数のイベントが出ることがある。

/**
 * 新しいカードを取り込んだ。登録したカードの全エディションの画像を取得する起点にもなる。
 * 中身は載せないので、読む側は cardId で今のカードを読む。
 */
export type CardRegistered = {
  readonly type: "CardRegistered";
  readonly cardId: CardId;
};

/** 面のルールに関わる特性が変わった。 */
export type CardCharacteristicsChanged = {
  readonly type: "CardCharacteristicsChanged";
  readonly cardId: CardId;
  readonly side: FaceSide;
  readonly before: CardCharacteristics;
  readonly after: CardCharacteristics;
};

/** 面のルールに関わらない値（sourceId・slug・effectRaw・取得元の更新日時）が変わった。 */
export type CardFaceRevised = {
  readonly type: "CardFaceRevised";
  readonly cardId: CardId;
  readonly side: FaceSide;
  readonly before: CardFace;
  readonly after: CardFace;
};

/** 新しい裁定が出た。登録のときは出さない（CardRegistered だけを出す）。 */
export type CardRulingAdded = {
  readonly type: "CardRulingAdded";
  readonly cardId: CardId;
  readonly ruling: Ruling;
  readonly isErrata: boolean;
};

/** 裁定が取得元から消えた。文が直った裁定は、古い文の Removed と新しい文の Added になる。 */
export type CardRulingRemoved = {
  readonly type: "CardRulingRemoved";
  readonly cardId: CardId;
  readonly ruling: Ruling;
};

/** 前後の両方にある裁定の並び順が変わった。裁定の増減と同時に出ることもある。 */
export type CardRulingsReordered = {
  readonly type: "CardRulingsReordered";
  readonly cardId: CardId;
  readonly rulings: readonly Ruling[];
};

export type CardReferencesChanged = {
  readonly type: "CardReferencesChanged";
  readonly cardId: CardId;
  readonly added: readonly CardReference[];
  readonly removed: readonly CardReference[];
};

export type CardLegalityChanged = {
  readonly type: "CardLegalityChanged";
  readonly cardId: CardId;
  readonly changes: readonly LegalityChange[];
};

/** CardLegalityChanged に載せる、1 フォーマット分の上限の変化。 */
export type LegalityChange = {
  readonly format: string;
  /** null は制限なし。 */
  readonly before: number | null;
  readonly after: number | null;
};

/** エディションが増えた。画像を初めて取得する起点。面と画像のパスは、読む側が今のカードから読む。 */
export type CardEditionAdded = {
  readonly type: "CardEditionAdded";
  readonly cardId: CardId;
  readonly editionId: CardEditionId;
};

/**
 * 既存のエディションの中身（セット・番号・レアリティ・既定かどうか・面の値）が変わった。
 * 取得元から消えたことと戻ったことは、Withdrawn と Reinstated で表す。
 */
export type CardEditionRevised = {
  readonly type: "CardEditionRevised";
  readonly cardId: CardId;
  readonly before: CardEdition;
  readonly after: CardEdition;
};

/** エディションが取得元から消えた。行は残し、既定から外す。画像も残す。 */
export type CardEditionWithdrawn = {
  readonly type: "CardEditionWithdrawn";
  readonly cardId: CardId;
  readonly editionId: CardEditionId;
};

/** 取り下げたエディションが取得元に戻ってきた。 */
export type CardEditionReinstated = {
  readonly type: "CardEditionReinstated";
  readonly cardId: CardId;
  readonly editionId: CardEditionId;
};

/** エディションの面に画像を結び付けた。 */
export type CardEditionImageAttached = {
  readonly type: "CardEditionImageAttached";
  readonly cardId: CardId;
  readonly editionId: CardEditionId;
  readonly side: FaceSide;
  readonly imageId: ImageId;
};

export type CardWithdrawn = {
  readonly type: "CardWithdrawn";
  readonly cardId: CardId;
};

/** 取り下げたカードが取得元に戻ってきた。 */
export type CardReinstated = {
  readonly type: "CardReinstated";
  readonly cardId: CardId;
};

export type CardEvent =
  | CardRegistered
  | CardCharacteristicsChanged
  | CardFaceRevised
  | CardRulingAdded
  | CardRulingRemoved
  | CardRulingsReordered
  | CardReferencesChanged
  | CardLegalityChanged
  | CardEditionAdded
  | CardEditionRevised
  | CardEditionWithdrawn
  | CardEditionReinstated
  | CardEditionImageAttached
  | CardWithdrawn
  | CardReinstated;
