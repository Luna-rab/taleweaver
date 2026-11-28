import { type Brand, createBrand } from "./utils/brand.js";
import { isListed } from "./utils/list.js";
import { ensure } from "./utils/rule-violation.js";

// 総合ルールの一覧（type-list#Types）に TOKEN を足したもの。取得元は大文字で返す。
// TOKEN は型でも supertype でもないが、トークンを表すカードは typeline に Token と書く
// （game-mechanics-tokens#General Rules:1.b）ので、取得元の types にも入る。
const TYPES = [
  "ACTION",
  "ALLY",
  "ATTACK",
  "CHAMPION",
  "DOMAIN",
  "ITEM",
  "MASTERY",
  "PHANTASIA",
  "WEAPON",
  "STATUS",
  "GREATER BOON",
  "LESSER BOON",
  "REGALIA",
  "UNIQUE",
  "TOKEN",
] as const;

/**
 * カードの type と supertype。新しい type が出たら、ここに足すまでそのカードの同期を拒否する。
 */
export type CardType = Brand<(typeof TYPES)[number], "CardType">;

const brand = createBrand<CardType>();

// 取得元の文字列を受け取る。一覧にない値は zod ではなくここで拒否し、Card 集約がそのカードの同期を rejected にする。
export function CardType(v: string): CardType {
  ensure(isListed(TYPES, v), `総合ルールにない type: ${v}`);
  return brand(v);
}
