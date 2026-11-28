import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** こちらが振るカードの id。取得元の id は SourceId で、別物。 */
export type CardId = Brand<string, "CardId">;

export const CardId = createBrand<CardId>((v) =>
  ensure(UUID.test(v), `CardId が UUID ではない: ${v}`),
);
