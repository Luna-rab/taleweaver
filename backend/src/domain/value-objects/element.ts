import { type Brand, createBrand } from "./utils/brand.js";
import { isListed } from "./utils/list.js";
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

// 取得元の文字列を受け取る。一覧にない値は zod ではなくここで拒否し、Card 集約がそのカードの同期を rejected にする。
export function Element(v: string): Element {
  ensure(isListed(ELEMENTS, v), `総合ルールにない属性: ${v}`);
  return brand(v);
}
