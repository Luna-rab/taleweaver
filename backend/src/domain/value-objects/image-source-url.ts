import { type Brand, createBrand } from "./utils/brand.js";

/** 画像を取得した取得元の URL。infrastructure が取得元の画像のパス（ImageSourcePath）から組み立てる。 */
export type ImageSourceUrl = Brand<string, "ImageSourceUrl">;

export const ImageSourceUrl = createBrand<ImageSourceUrl>();
