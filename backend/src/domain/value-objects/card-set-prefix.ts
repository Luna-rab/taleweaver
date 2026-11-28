import { type Brand, createBrand } from "./utils/brand.js";

/**
 * セットの略号（例: P24、DOA 1st）。セットごとに一意で、取得元がセットの id を振り直したときの照合に使う。
 * 空白を含む略号が実在する。
 */
export type CardSetPrefix = Brand<string, "CardSetPrefix">;

export const CardSetPrefix = createBrand<CardSetPrefix>();
