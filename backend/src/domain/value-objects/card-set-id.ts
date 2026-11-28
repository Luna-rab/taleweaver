import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** セットは CardSet 集約が持ち、Card 集約は id だけを持つ。 */
export type CardSetId = Brand<string, "CardSetId">;

export const CardSetId = createBrand<CardSetId>((v) =>
  ensure(UUID.test(v), `CardSetId が UUID ではない: ${v}`),
);
