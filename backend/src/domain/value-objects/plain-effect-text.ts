import { type Brand, createBrand } from "./utils/brand.js";

/** 効果文から記法を外した、検索用の文。ルールに関わらないので、変わっても CardCharacteristicsChanged にしない。 */
export type PlainEffectText = Brand<string, "PlainEffectText">;

export const PlainEffectText = createBrand<PlainEffectText>();
