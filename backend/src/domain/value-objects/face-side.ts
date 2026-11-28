import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

const SIDES = ["front", "back"] as const;

/** カードやエディションの面。片面のカードは front だけを持つ。 */
export type FaceSide = Brand<(typeof SIDES)[number], "FaceSide">;

export const FaceSide = createBrand<FaceSide>((v) =>
  ensure(SIDES.includes(v), `FaceSide が front でも back でもない: ${v}`),
);
