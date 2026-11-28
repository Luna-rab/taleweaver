import { type Brand, createBrand } from "./utils/brand.js";
import { ensure } from "./utils/rule-violation.js";

/** 画像の幅と高さ（ピクセル）。 */
export type ImageDimensions = Brand<
  { readonly width: number; readonly height: number },
  "ImageDimensions"
>;

export const ImageDimensions = createBrand<ImageDimensions>(({ width, height }) =>
  ensure(
    [width, height].every((n) => Number.isInteger(n) && n > 0),
    `画像の大きさが正の整数ではない: ${width}x${height}`,
  ),
);
