import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

/** 裁定の題（"ERRATA" など）。題のない裁定は、空文字ではなく null で表す。 */
export type RulingTitle = Brand<string, "RulingTitle">;

export const RulingTitle = createBrand<RulingTitle>((v) =>
  ensure(v.trim().length > 0, "裁定の題が空文字（題がないときは null）"),
);
