import type { ImageId } from "../../value-objects/image-id.js";
import type { StorageKey } from "../../value-objects/storage-key.js";
import type { Image } from "./entities/image.js";

/** 新しい画像を登録した。application は保存の前に、ファイルを image.storageKey に置く。 */
export type ImageRegistered = {
  readonly type: "ImageRegistered";
  readonly imageId: ImageId;
  readonly image: Image;
};

/**
 * 取得元の絵が差し替わった。application は保存の前に新しいファイルを image.storageKey に置き、
 * 保存した後に previousStorageKey のファイルを消す。
 */
export type ImageReplaced = {
  readonly type: "ImageReplaced";
  readonly imageId: ImageId;
  readonly previousStorageKey: StorageKey;
  readonly image: Image;
};

export type ImageEvent = ImageRegistered | ImageReplaced;
