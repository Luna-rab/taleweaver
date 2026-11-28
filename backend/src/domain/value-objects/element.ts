import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

// 総合ルールの一覧（type-list#Elements）と同じ。取得元は大文字で返す。
const ELEMENTS = [
  "NORM",
  "FIRE",
  "WATER",
  "WIND",
  "ARCANE",
  "ASTRA",
  "CRUX",
  "EXALTED",
  "EXIA",
  "LUXEM",
  "NEOS",
  "TERA",
  "UMBRA",
] as const;

/**
 * カードの属性。新しい属性が出たら、ここに足すまでそのカードの同期を拒否する。
 */
export type Element = Brand<(typeof ELEMENTS)[number], "Element">;

const brand = createBrand<Element>();

// 取得元の文字列を受け取る。一覧にない値は zod ではなくここで拒否し、そのカードを CardSyncRejected にする。
export function Element(v: string): Element {
  ensure(isListed(v), `総合ルールにない属性: ${v}`);
  return brand(v);
}

function isListed(v: string): v is (typeof ELEMENTS)[number] {
  return ELEMENTS.some((e) => e === v);
}
