import { type Brand, createBrand } from "./utils/brand.js";

/** こちらが振るカードの id。取得元の id は SourceId で、別物。 */
export type CardId = Brand<string, "CardId">;

export const CardId = createBrand<CardId>();
