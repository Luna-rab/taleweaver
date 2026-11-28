import type { CardEditionId } from "../value-objects/card-edition-id.js";
import type { CardId } from "../value-objects/card-id.js";
import type { CardSetId } from "../value-objects/card-set-id.js";
import type { ImageId } from "../value-objects/image-id.js";

/** 主キーを保存の前に決める。DB の uuidv7() と同じく、時刻順に並ぶ UUID v7 を返すこと。 */
export interface IdGenerator {
  newCardId(): CardId;
  newCardEditionId(): CardEditionId;
  newCardSetId(): CardSetId;
  newImageId(): ImageId;
}
