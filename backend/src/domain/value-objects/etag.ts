import { type Brand, createBrand } from "./utils/brand.js";

/** 取得元が画像に付ける ETag。次に取得するとき If-None-Match に付けて、変わっていなければ 304 を受け取る。 */
export type ETag = Brand<string, "ETag">;

export const ETag = createBrand<ETag>();
