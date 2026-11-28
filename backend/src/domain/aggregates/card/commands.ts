import type { CardEditionId } from "../../value-objects/card-edition-id.js";
import type { CardId } from "../../value-objects/card-id.js";
import type { FaceSide } from "../../value-objects/face-side.js";
import type { ImageId } from "../../value-objects/image-id.js";

// スナップショットは検証前の値を持つ。業務の規則は集約が value object を作るときに確かめ、
// 合わなければ例外ではなく CardSyncRejected を返す。
// 取得元の応答の形（型・必須項目）は infrastructure が zod で確かめてから、この形に直す。

export type CardFaceSnapshot = {
  readonly sourceId: string;
  readonly slug: string;
  readonly name: string;
  readonly elements: readonly string[];
  readonly classes: readonly string[];
  readonly types: readonly string[];
  readonly subtypes: readonly string[];
  readonly cost:
    | { readonly type: "memory" | "reserve"; readonly value: number | "X" }
    | { readonly type: "none" };
  readonly level: number | null;
  readonly life: number | null;
  readonly power: number | null;
  readonly durability: number | null;
  readonly speed: "fast" | "slow" | null;
  readonly effect: string | null;
  readonly effectRaw: string | null;
  readonly sourceUpdatedAt: Date;
};

export type CardEditionFaceSnapshot = {
  readonly sourceId: string;
  readonly slug: string;
  readonly illustrator: string | null;
  readonly collaborators: readonly string[];
  readonly flavor: string | null;
  readonly imageSourcePath: string;
  readonly sourceUpdatedAt: Date;
};

export type CardEditionSnapshot = {
  /** 取得元のセットの id。CardSet 集約に先に同期しておく。 */
  readonly setSourceId: string;
  readonly collectorNumber: string;
  readonly rarity: number;
  readonly isDefault: boolean;
  readonly front: CardEditionFaceSnapshot;
  readonly back: CardEditionFaceSnapshot | null;
};

// 面は配列ではなく表と裏で持ち、表のないカードや同じ側が 2 つあるカードを型の上で作れないようにする。
export type CardSnapshot = {
  readonly front: CardFaceSnapshot;
  /** 片面のカードは null。 */
  readonly back: CardFaceSnapshot | null;
  readonly legality: Readonly<Record<string, number>>;
  readonly rulings: readonly {
    readonly title: string | null;
    readonly addedOn: string;
    readonly description: string;
  }[];
  readonly references: readonly { readonly kind: string; readonly targetSlug: string }[];
  readonly editions: readonly CardEditionSnapshot[];
};

/** 取得元のカード 1 枚分に合わせる。登録・改訂・変更なし・拒否は集約が判断する。 */
export type SyncCard = {
  readonly type: "SyncCard";
  readonly snapshot: CardSnapshot;
  /** エディションが取得元から消えていたとき、取り下げた時刻として使う。 */
  readonly syncedAt: Date;
};

/**
 * 取得元から消えたカードに取り下げの印を付ける。
 * どのカードが消えたかは 1 枚分の集約からは分からないので、selectCardsToWithdraw で決めてから送る。
 */
export type WithdrawCard = {
  readonly type: "WithdrawCard";
  readonly cardId: CardId;
  readonly withdrawnAt: Date;
};

/** 取得して保存した画像を、エディションの面に結び付ける。画像を差し替えたときも同じ画像の id のままなので、送るのは新しい画像のときだけ。 */
export type AttachEditionImage = {
  readonly type: "AttachEditionImage";
  readonly cardId: CardId;
  readonly editionId: CardEditionId;
  readonly side: FaceSide;
  readonly imageId: ImageId;
};

export type CardCommand = SyncCard | WithdrawCard | AttachEditionImage;
