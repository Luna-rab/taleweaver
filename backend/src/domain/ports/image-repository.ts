import type { Image } from "../aggregates/image/entities/image.js";
import type { ImageId } from "../value-objects/image-id.js";

export interface ImageRepository {
  findById(id: ImageId): Promise<Image | null>;
  /** 画像を id を鍵に upsert する。ファイルは application が先にストレージへ置いておく。 */
  save(image: Image): Promise<void>;
}
