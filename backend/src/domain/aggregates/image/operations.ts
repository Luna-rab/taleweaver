import type { ImageContentType } from "../../value-objects/image-content-type.js";
import type { ImageId } from "../../value-objects/image-id.js";
import type { StorageKey } from "../../value-objects/storage-key.js";
import type { Image } from "./entities/image.js";

/** Image 集約が判断のために必要とする操作。application が ports の実装から組み立てて渡す。 */
export type ImageOperations = {
  findById(id: ImageId): Promise<Image | null>;
  newImageId(): ImageId;
  /** 呼ぶたびに、まだ使っていないキーを返す。 */
  newStorageKey(imageId: ImageId, contentType: ImageContentType): StorageKey;
};
