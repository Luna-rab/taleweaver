import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

/**
 * 1=C 2=U 3=R 4=SR 5=UR 6=PR 7=CSR 8=CUR 9=CPR。
 * 上限は置かない。新しいレアリティが出たときに拒否し続けないため。
 */
export type Rarity = Brand<number, "Rarity">;

export const Rarity = createBrand<Rarity>((v) =>
  ensure(Number.isInteger(v) && v >= 1, `レアリティが正の整数ではない: ${v}`),
);
