import { type Brand, createBrand } from "./utils/brand.js";

/**
 * 参照の種類（SUMMON・MASTERY・GENERATE など）。取得元が種類を足しても拒否しないよう、列挙にしない。
 */
export type ReferenceKind = Brand<string, "ReferenceKind">;

export const ReferenceKind = createBrand<ReferenceKind>();
