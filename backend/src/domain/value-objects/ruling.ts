import type { CalendarDate } from "./calendar-date.js";
import type { RulingDescription } from "./ruling-description.js";
import type { RulingTitle } from "./ruling-title.js";
import { type Brand, createBrand } from "./utils/brand.js";

/**
 * 公式の裁定とエラッタ。取得元は id を付けないので、3 つの値がすべて同じものを同じ裁定とみなす。
 * 文の誤字が直ると別の裁定として扱われ、「新しい裁定」として知らせてしまうが、まれなので許容する。
 */
export type Ruling = Brand<
  {
    readonly title: RulingTitle | null;
    readonly addedOn: CalendarDate;
    readonly description: RulingDescription;
  },
  "Ruling"
>;

export const Ruling = createBrand<Ruling>();

export function sameRuling(a: Ruling, b: Ruling): boolean {
  return a.title === b.title && a.addedOn === b.addedOn && a.description === b.description;
}

/** 取得元はエラッタを、題に ERRATA を含む裁定として出す（例: "ERRATA"、"ERRATA, DTR"）。 */
export function isErrata(ruling: Ruling): boolean {
  return ruling.title?.toUpperCase().includes("ERRATA") ?? false;
}
