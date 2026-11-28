import { type Brand, createBrand } from "./utils/brand.js";

/** セット内のカード番号。"001A" のような番号があるので文字列で持つ。セット内で一意ではない（絵違いがある）。 */
export type CollectorNumber = Brand<string, "CollectorNumber">;

export const CollectorNumber = createBrand<CollectorNumber>();
