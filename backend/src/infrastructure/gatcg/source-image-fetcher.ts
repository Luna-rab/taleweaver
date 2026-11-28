import { imageSize } from "image-size";

import type {
  SourceImageDownload,
  SourceImageFetcher,
} from "../../application/ports/source-image-fetcher.js";
import type { ImageSourcePath } from "../../domain/value-objects/image-source-path.js";

// 1 枚のカードの面は最も多くて 17 あり、全部が打ち切られても仕事を押さえる 5 分に収まる長さにする。
const TIMEOUT_MS = 15_000;

/** api.gatcg.com の画像を取得する。ETag は付けない。 */
export class GatcgSourceImageFetcher implements SourceImageFetcher {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string, fetchFn: typeof fetch = fetch) {
    this.#baseUrl = baseUrl;
    this.#fetch = fetchFn;
  }

  async fetch(path: ImageSourcePath): Promise<SourceImageDownload> {
    const url = `${this.#baseUrl}${path}`;
    const response = await this.#fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status === 404) return { result: { kind: "notFound" } };
    if (!response.ok) throw new Error(`${url} が ${response.status} を返した`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    // 形式を読めなければ imageSize が例外を投げ、仕事は試し直しになる。
    const { width, height } = imageSize(bytes);
    return {
      result: {
        kind: "fetched",
        contentType: mediaType(response.headers.get("content-type") ?? ""),
        width,
        height,
        byteSize: bytes.byteLength,
        etag: response.headers.get("etag"),
      },
      bytes,
    };
  }
}

/** `image/jpeg; charset=...` のような値から、引数を除いた MIME タイプを小文字で取り出す。 */
function mediaType(contentType: string): string {
  return contentType.split(";")[0]!.trim().toLowerCase();
}
