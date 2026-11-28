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

export type CardSetEvent = CardSetRegistered | CardSetRevised;
