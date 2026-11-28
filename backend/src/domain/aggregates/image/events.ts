import type { ImageId } from "../../value-objects/image-id.js";
import type { StorageKey } from "../../value-objects/storage-key.js";

/** 新しい画像を登録した。application は保存の前に、ファイルを集約の state の storageKey に置く。 */
export type ImageRegistered = {
  readonly type: "ImageRegistered";
  readonly imageId: ImageId;
};

/**
 * 取得元の絵が差し替わった。application は保存の前に新しいファイルを集約の state の storageKey に置き、
 * 保存した後に previousStorageKey のファイルを消す。古いキーはほかのどこにも残らないので、イベントに載せる。
 */
export type ImageReplaced = {
  readonly type: "ImageReplaced";
  readonly imageId: ImageId;
  readonly previousStorageKey: StorageKey;
};

export type ImageEvent = ImageRegistered | ImageReplaced;
