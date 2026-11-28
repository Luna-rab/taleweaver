import { type Brand, createBrand } from "./utils/brand.js";

export type CardEditionId = Brand<string, "CardEditionId">;

export const CardEditionId = createBrand<CardEditionId>();
