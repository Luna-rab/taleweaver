import { type Brand, createBrand } from "./utils/brand.js";

export type ImageId = Brand<string, "ImageId">;

export const ImageId = createBrand<ImageId>();
