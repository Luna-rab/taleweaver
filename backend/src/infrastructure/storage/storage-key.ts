import { randomUUIDv7 } from "node:crypto";

import type { ImageContentType } from "../../domain/value-objects/image-content-type.js";
import type { ImageId } from "../../domain/value-objects/image-id.js";
import { StorageKey } from "../../domain/value-objects/storage-key.js";

const EXTENSIONS: ReadonlyMap<string, string> = new Map([["jpeg", "jpg"]]);

/** `<画像の id>/<UUID v7>.<拡張子>` のキーを作る。拡張子は MIME タイプの subtype から決め、jpeg は jpg にする。 */
export function newStorageKey(imageId: ImageId, contentType: ImageContentType): StorageKey {
  const subtype = contentType.slice(contentType.indexOf("/") + 1);
  return StorageKey(`${imageId}/${randomUUIDv7()}.${EXTENSIONS.get(subtype) ?? subtype}`);
}
