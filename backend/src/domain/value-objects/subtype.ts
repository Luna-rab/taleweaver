import { type Brand, createBrand } from "./utils/brand.js";

/**
 * カードの subtype（HUMAN・SPELL・SWORD など）。160 種を超え、弾ごとに増えるので列挙にしない。
 */
export type Subtype = Brand<string, "Subtype">;

export const Subtype = createBrand<Subtype>();
