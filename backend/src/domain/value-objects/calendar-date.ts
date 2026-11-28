import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

export type CalendarDate = Brand<string, "CalendarDate">;

export const CalendarDate = createBrand<CalendarDate>((v) =>
  ensure(/^\d{4}-\d{2}-\d{2}$/.test(v) && exists(v), `日付が YYYY-MM-DD ではない: ${v}`),
);

// Date.parse は 2023-02-29 を NaN にせず 03-01 に繰り上げるので、日付に戻して元の文字列と一致するかで確かめる。
function exists(v: string): boolean {
  const date = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v;
}
