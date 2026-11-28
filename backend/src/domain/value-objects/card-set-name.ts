import { type Brand, createBrand } from "./utils/brand.js";

export type CardSetName = Brand<string, "CardSetName">;

export const CardSetName = createBrand<CardSetName>();
