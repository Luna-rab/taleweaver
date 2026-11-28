import { type Brand, createBrand } from "./utils/brand.js";

/** セットの言語（EN・CN など）。取得元が言語を足しても拒否しないよう、列挙にしない。 */
export type CardSetLanguage = Brand<string, "CardSetLanguage">;

export const CardSetLanguage = createBrand<CardSetLanguage>();
