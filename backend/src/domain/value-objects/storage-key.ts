import { type Brand, createBrand } from "./utils/brand.js";

/**
 * 自前のストレージで画像ファイルを置くキー。画像を差し替えるたびに新しいキーにする。
 * 同じキーに上書きすると、DB の保存に失敗したときにファイルと行が食い違い、配信先のキャッシュにも古い絵が残るため。
 */
export type StorageKey = Brand<string, "StorageKey">;

export const StorageKey = createBrand<StorageKey>();
