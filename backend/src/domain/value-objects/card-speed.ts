import { type Brand, createBrand } from "./utils/brand.js";

/** アクションとブーンの速度。 */
export type CardSpeed = Brand<"fast" | "slow", "CardSpeed">;

export const CardSpeed = createBrand<CardSpeed>();
