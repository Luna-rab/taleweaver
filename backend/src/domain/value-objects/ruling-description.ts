import { type Brand, createBrand } from "./utils/brand.js";

export type RulingDescription = Brand<string, "RulingDescription">;

export const RulingDescription = createBrand<RulingDescription>();
