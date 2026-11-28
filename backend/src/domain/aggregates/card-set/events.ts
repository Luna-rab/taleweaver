import type { CardSetId } from "../../value-objects/card-set-id.js";
import type { CardSet } from "./entities/card-set.js";

export type CardSetRegistered = {
  readonly type: "CardSetRegistered";
  readonly cardSetId: CardSetId;
  readonly cardSet: CardSet;
};

/** 名前・略号・言語・発売日などが変わった。発売日が決まったときもこれで知らせる。 */
export type CardSetRevised = {
  readonly type: "CardSetRevised";
  readonly cardSetId: CardSetId;
  readonly before: CardSet;
  readonly after: CardSet;
};

export type CardSetUnchanged = {
  readonly type: "CardSetUnchanged";
  readonly cardSetId: CardSetId;
};

/**
 * 取得元のデータが業務の規則に合わないので、同期を拒否した。状態は前回のまま。
 * 照合の前に拒否したときは cardSetId が null。sourceId は検証前の値なので文字列で持つ。
 */
export type CardSetSyncRejected = {
  readonly type: "CardSetSyncRejected";
  readonly cardSetId: CardSetId | null;
  readonly sourceId: string;
  readonly reason: string;
};

export type CardSetEvent =
  | CardSetRegistered
  | CardSetRevised
  | CardSetUnchanged
  | CardSetSyncRejected;

/** 状態を変えたイベントか。application は、これに当たるイベントがあれば repository.save を呼ぶ。 */
export function changesState(event: CardSetEvent): boolean {
  return event.type !== "CardSetUnchanged" && event.type !== "CardSetSyncRejected";
}
