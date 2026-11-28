import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

/** ファイルの大きさ（バイト）。空のファイルは取得元の誤りとして拒否する。 */
export type ByteSize = Brand<number, "ByteSize">;

export const ByteSize = createBrand<ByteSize>((v) =>
  ensure(Number.isInteger(v) && v > 0, `ファイルの大きさが正の整数ではない: ${v}`),
);
