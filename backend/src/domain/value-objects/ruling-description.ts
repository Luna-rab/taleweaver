import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

export type RulingDescription = Brand<string, "RulingDescription">;

export const RulingDescription = createBrand<RulingDescription>((v) =>
  ensure(v.trim().length > 0, "裁定の本文が空"),
);
