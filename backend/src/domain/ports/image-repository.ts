import type { Image } from "../aggregates/image/entities/image.js";
import type { ImageId } from "../value-objects/image-id.js";

export interface ImageRepository {
  findById(id: ImageId): Promise<Image | null>;
  /**
   * 画像を保存し、版を 1 上げる。version が 0 なら新しい画像として版 1 で追加する。
   * それ以外は保存済みの版が image.version のときだけ書き換え、違えば OptimisticLockError を投げる。
   * ファイルは application が先にストレージへ置いておく。
   */
  save(image: Image): Promise<void>;
}
