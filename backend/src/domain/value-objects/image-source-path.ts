import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

/** 取得元での画像のパス（例: /cards/images/Wa5g8PP0Q1.jpg）。エディションの id で決まり、絵が差し替わっても変わらない。 */
export type ImageSourcePath = Brand<string, "ImageSourcePath">;

export const ImageSourcePath = createBrand<ImageSourcePath>((v) =>
  ensure(/^\/\S+$/.test(v), `画像のパスが / で始まらないか、空白を含む: "${v}"`),
);
