import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

/** カードの面の名前。一意ではない（同じ名前のカードが実在する）。 */
export type CardName = Brand<string, "CardName">;

export const CardName = createBrand<CardName>((v) => ensure(v.trim().length > 0, "CardName が空"));
