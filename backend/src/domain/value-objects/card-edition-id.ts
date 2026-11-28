import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CardEditionId = Brand<string, "CardEditionId">;

export const CardEditionId = createBrand<CardEditionId>((v) =>
  ensure(UUID.test(v), `CardEditionId が UUID ではない: ${v}`),
);
