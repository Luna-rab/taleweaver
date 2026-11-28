import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

const SPEEDS = ["fast", "slow"] as const;

/** アクションとブーンの速度。 */
export type CardSpeed = Brand<(typeof SPEEDS)[number], "CardSpeed">;

export const CardSpeed = createBrand<CardSpeed>((v) =>
  ensure(SPEEDS.includes(v), `CardSpeed が fast でも slow でもない: ${v}`),
);
