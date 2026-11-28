import { type Brand, createBrand } from "./utils/brand.js";

/** セットは CardSet 集約が持ち、Card 集約は id だけを持つ。 */
export type CardSetId = Brand<string, "CardSetId">;

export const CardSetId = createBrand<CardSetId>();
