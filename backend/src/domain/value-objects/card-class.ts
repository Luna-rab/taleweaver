import { type Brand, createBrand } from "./utils/brand.js";
import { isListed } from "./utils/list.js";
import { ensure } from "./utils/rule-violation.js";

// 総合ルールの class subtype の一覧（type-list#Subtypes の Class Subtypes）と同じ。取得元は大文字で返す。
const CLASSES = [
  "ASSASSIN",
  "CLERIC",
  "GUARDIAN",
  "MAGE",
  "RANGER",
  "SPIRIT",
  "TAMER",
  "WARRIOR",
  "ANOMALY",
] as const;

/**
 * カードの class。新しい class が出たら、ここに足すまでそのカードの同期を拒否する。
 */
export type CardClass = Brand<(typeof CLASSES)[number], "CardClass">;

const brand = createBrand<CardClass>();

// 取得元の文字列を受け取る。一覧にない値は zod ではなくここで拒否し、Card 集約がそのカードの同期を rejected にする。
export function CardClass(v: string): CardClass {
  ensure(isListed(CLASSES, v), `総合ルールにない class: ${v}`);
  return brand(v);
}
