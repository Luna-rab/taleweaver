import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

/** 画像の MIME タイプ（image/jpeg など）。取得元が形式を変えても拒否しないよう、image/ で始まるかだけを確かめる。 */
export type ImageContentType = Brand<string, "ImageContentType">;

export const ImageContentType = createBrand<ImageContentType>((v) =>
  ensure(/^image\/\S+$/.test(v), `画像ではない: ${v}`),
);
