import { type Brand, createBrand } from "./utils/brand.js";

export type FlavorText = Brand<string, "FlavorText">;

export const FlavorText = createBrand<FlavorText>();
