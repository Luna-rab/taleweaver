import type { ImageContentType } from "../../domain/value-objects/image-content-type.js";
import type { StorageKey } from "../../domain/value-objects/storage-key.js";

/** 画像ファイルの置き場所。 */
export interface ImageStorage {
  /** key にファイルを置く。同じ key に置き直すことはない（差し替えは新しい key に置く）。 */
  put(key: StorageKey, bytes: Uint8Array, contentType: ImageContentType): Promise<void>;
  delete(key: StorageKey): Promise<void>;
}
