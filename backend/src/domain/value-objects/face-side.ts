import { type Brand, createBrand } from "./utils/brand.js";

/** カードやエディションの面。片面のカードは front だけを持つ。 */
export type FaceSide = Brand<"front" | "back", "FaceSide">;

export const FaceSide = createBrand<FaceSide>();
