import type {
  FetchedSourceImage,
  SourceImageNotFound,
} from "../../domain/aggregates/image/commands.js";
import type { ImageSourcePath } from "../../domain/value-objects/image-source-path.js";

/** 取得した画像。bytes は集約に渡さず、application がストレージに置く。 */
export type SourceImageDownload =
  | { readonly result: FetchedSourceImage; readonly bytes: Uint8Array }
  | { readonly result: SourceImageNotFound };

/** 取得元から画像を取得する。 */
export interface SourceImageFetcher {
  /** 404 なら notFound を返す。それ以外の失敗は例外を投げる。 */
  fetch(path: ImageSourcePath): Promise<SourceImageDownload>;
}
