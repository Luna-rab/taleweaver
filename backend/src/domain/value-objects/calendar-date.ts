import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

export type CalendarDate = Brand<string, "CalendarDate">;

export const CalendarDate = createBrand<CalendarDate>((v) =>
  ensure(
    /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)),
    `日付が YYYY-MM-DD ではない: ${v}`,
  ),
);
