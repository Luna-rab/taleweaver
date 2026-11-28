import type { ImageId } from "../../value-objects/image-id.js";

// 画像の取得は application が行い、結果をコマンドで渡す。集約は取得した結果からイベントを決めるだけで、
// ファイルを受け取らない。ファイルは application がイベントの storageKey に置く。

/** 取得元から画像を取得できた。値は検証前のもの。 */
export type FetchedSourceImage = {
  readonly kind: "fetched";
  readonly contentType: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly etag: string | null;
};

/** 取得元が 404 を返した。 */
export type SourceImageNotFound = { readonly kind: "notFound" };

/** If-None-Match を付けて取得し、取得元が 304 を返した。 */
export type SourceImageNotModified = { readonly kind: "notModified" };

/** 取得元の画像を初めて保存する。 */
export type RegisterSourceImage = {
  readonly type: "RegisterSourceImage";
  readonly sourceUrl: string;
  readonly fetched: FetchedSourceImage | SourceImageNotFound;
};

/**
 * 保存済みの画像を取得元に問い合わせた結果を反映する。
 * 取得元の URL が変わっていれば、ETag を付けずに取得し直して送る（304 は前と同じ URL のときだけ受け付ける）。
 */
export type RefreshSourceImage = {
  readonly type: "RefreshSourceImage";
  readonly imageId: ImageId;
  readonly sourceUrl: string;
  readonly fetched: FetchedSourceImage | SourceImageNotFound | SourceImageNotModified;
};

export type ImageCommand = RegisterSourceImage | RefreshSourceImage;
