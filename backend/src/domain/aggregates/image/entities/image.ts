import type { ByteSize } from "../../../value-objects/byte-size.js";
import type { ETag } from "../../../value-objects/etag.js";
import type { ImageContentType } from "../../../value-objects/image-content-type.js";
import type { ImageDimensions } from "../../../value-objects/image-dimensions.js";
import type { ImageId } from "../../../value-objects/image-id.js";
import type { ImageSourceUrl } from "../../../value-objects/image-source-url.js";
import type { StorageKey } from "../../../value-objects/storage-key.js";

/**
 * 自前のストレージに保存した画像ファイル。id で区別し、絵を差し替えても同じ画像として追う。
 * 何の画像かは持たない。使う側（エディションの面など）が id で参照し、参照を書くのも使う側。
 */
export type Image = {
  readonly id: ImageId;
  readonly storageKey: StorageKey;
  readonly contentType: ImageContentType;
  readonly dimensions: ImageDimensions;
  readonly byteSize: ByteSize;
  /** 取得元から取得した画像の出どころ。利用者がアップロードした画像は null。 */
  readonly source: ImageSource | null;
};

export type ImageSource = {
  readonly url: ImageSourceUrl;
  /** 取得元が ETag を返さなかったときは null。そのときは毎回取得し直す。 */
  readonly etag: ETag | null;
};
