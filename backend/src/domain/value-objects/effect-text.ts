import { type Brand, createBrand } from "./utils/brand.js";

/** 取得元の記法つきの効果文。ルールに関わるので、変わると CardCharacteristicsChanged を出す。 */
export type EffectText = Brand<string, "EffectText">;

export const EffectText = createBrand<EffectText>();
