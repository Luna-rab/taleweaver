import type { CardCharacteristics } from "../../value-objects/card-characteristics.js";
import type { CardEditionId } from "../../value-objects/card-edition-id.js";
import type { CardId } from "../../value-objects/card-id.js";
import type { CardReference } from "../../value-objects/card-reference.js";
import type { FaceSide } from "../../value-objects/face-side.js";
import type { ImageSourcePath } from "../../value-objects/image-source-path.js";
import type { Ruling } from "../../value-objects/ruling.js";
import type { SourceId } from "../../value-objects/source-id.js";
import type { LegalityChange } from "./card-aggregate.js";
import type { CardEdition } from "./entities/card-edition.js";
import type { CardFace } from "./entities/card-face.js";
import type { Card } from "./entities/card.js";

// コマンドを処理したら、何が起きたかを必ずイベントで返す。変更がなかったことや拒否したことも含む。
// 状態の変化はどれも、いずれかのイベントで表す（購読する処理がまだないイベントもある）。
// 1 回のコマンドで、変わった部分ごとに複数のイベントが出ることがある。

/** 新しいカードを取り込んだ。登録したカードの全エディションの画像を取得する起点にもなる。 */
export type CardRegistered = {
  readonly type: "CardRegistered";
  readonly cardId: CardId;
  readonly card: Card;
};

/** 同期した結果が今の状態と同じだった。または、取り下げ済みのカードをもう一度取り下げようとした。 */
export type CardUnchanged = {
  readonly type: "CardUnchanged";
  readonly cardId: CardId;
};

/**
 * 取得元のデータが業務の規則に合わないので、同期を拒否した。状態は前回のまま。
 * 照合の前に拒否したときは cardId が null。sourceId は検証前の値なので文字列で持つ。
 */
export type CardSyncRejected = {
  readonly type: "CardSyncRejected";
  readonly cardId: CardId | null;
  readonly frontSourceId: string;
  readonly reason: string;
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

/** 新しい裁定が出た。登録のときは出さない（CardRegistered が全件を持つ）。 */
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

/** エディションが増えた。画像を初めて取得する起点。 */
export type CardEditionAdded = {
  readonly type: "CardEditionAdded";
  readonly cardId: CardId;
  readonly editionId: CardEditionId;
  readonly faces: readonly {
    readonly side: FaceSide;
    readonly sourceId: SourceId;
    readonly imageSourcePath: ImageSourcePath;
  }[];
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

/** エディションが取得元から消えた。行は残し、既定から外す。画像を消すかは Image 側が決める。 */
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
  | CardUnchanged
  | CardSyncRejected
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
  | CardWithdrawn
  | CardReinstated;

/** 状態を変えたイベントか。application は、これに当たるイベントが 1 つでもあれば repository.save を呼ぶ。 */
export function changesState(event: CardEvent): boolean {
  return event.type !== "CardUnchanged" && event.type !== "CardSyncRejected";
}
