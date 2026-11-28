import { ByteSize } from "../../value-objects/byte-size.js";
import { ETag } from "../../value-objects/etag.js";
import { ImageContentType } from "../../value-objects/image-content-type.js";
import { ImageDimensions } from "../../value-objects/image-dimensions.js";
import type { ImageId } from "../../value-objects/image-id.js";
import { ImageSourceUrl } from "../../value-objects/image-source-url.js";
import { ensure, RuleViolation } from "../../value-objects/utils/rule-violation.js";
import type {
  FetchedSourceImage,
  ImageCommand,
  RefreshSourceImage,
  RegisterSourceImage,
  SourceImageNotFound,
} from "./commands.js";
import type { Image } from "./entities/image.js";
import type { ImageEvent } from "./events.js";
import type { ImageOperations } from "./operations.js";

/**
 * 自前のストレージに保存した画像を扱う集約。ファイルの読み書きはせず、取得した結果からイベントと次の状態を決める。
 *
 * execute は何が起きたかを必ず 1 件以上のイベントで返す。
 * application は changesState に当たるイベントがあれば、ファイルを置いてから state を repository.save に渡す。
 *
 * 1 つのインスタンスは 1 つの画像だけを扱う。別の画像のコマンドが送られたら例外を投げる。
 */
export class ImageAggregate {
  readonly #ops: ImageOperations;
  #state: Image | null = null;

  constructor(ops: ImageOperations) {
    this.#ops = ops;
  }

  /** このインスタンスが扱う画像の、最後のコマンドを処理した後の状態。拒否したときは前の状態のまま。 */
  get state(): Image | null {
    return this.#state;
  }

  async execute(command: ImageCommand): Promise<readonly ImageEvent[]> {
    switch (command.type) {
      case "RegisterSourceImage":
        return this.#register(command);
      case "RefreshSourceImage":
        return await this.#refresh(command);
    }
  }

  /** 取得元の画像を新しい画像として登録する。取得元に無いか、画像として受け付けられなければ拒否する。 */
  #register(command: RegisterSourceImage): readonly ImageEvent[] {
    if (this.#state !== null) {
      throw new Error(`画像 ${this.#state.id} を扱うインスタンスに、新しい画像の登録が送られた`);
    }
    try {
      const { etag, ...file } = parseFetched(command.fetched);
      const id = this.#ops.newImageId();
      const image: Image = {
        id,
        storageKey: this.#ops.newStorageKey(id, file.contentType),
        ...file,
        source: { url: ImageSourceUrl(command.sourceUrl), etag },
      };
      this.#state = image;
      return [{ type: "ImageRegistered", imageId: id, image }];
    } catch (error) {
      return rejection(error, command.sourceUrl, null);
    }
  }

  /**
   * 保存済みの画像を取得元に問い合わせた結果を反映する。304 なら ImageUnchanged、取得できれば新しいキーで
   * ImageReplaced を返す。取得元から消えていたら拒否し、保存済みの画像は残す。
   */
  async #refresh(command: RefreshSourceImage): Promise<readonly ImageEvent[]> {
    const existing = await this.#load(command.imageId);
    this.#state = existing;
    if (existing.source === null) {
      throw new Error(`画像 ${existing.id} はアップロードされたもので、取得元がない`);
    }
    const url = ImageSourceUrl(command.sourceUrl);
    if (command.fetched.kind === "notModified") {
      // 304 は送った ETag の URL についての答えなので、URL が変わっていれば application が古い ETag を付けている。
      if (url !== existing.source.url) {
        throw new Error(`画像 ${existing.id} の取得元が変わったのに、前の ETag で問い合わせた`);
      }
      return [{ type: "ImageUnchanged", imageId: existing.id }];
    }
    try {
      const { etag, ...file } = parseFetched(command.fetched);
      const image: Image = {
        id: existing.id,
        storageKey: this.#ops.newStorageKey(existing.id, file.contentType),
        ...file,
        source: { url, etag },
      };
      this.#state = image;
      return [
        {
          type: "ImageReplaced",
          imageId: existing.id,
          previousStorageKey: existing.storageKey,
          image,
        },
      ];
    } catch (error) {
      return rejection(error, command.sourceUrl, existing.id);
    }
  }

  /** id を指定したコマンドの対象を読む。別の画像を扱うインスタンスに送られたら、application の誤りとして例外にする。 */
  async #load(imageId: ImageId): Promise<Image> {
    if (this.#state !== null && this.#state.id !== imageId) {
      throw new Error(
        `画像 ${this.#state.id} を扱うインスタンスに、別の画像 ${imageId} のコマンドが送られた`,
      );
    }
    const found = this.#state ?? (await this.#ops.findById(imageId));
    if (found === null) throw new Error(`画像がない: ${imageId}`);
    return found;
  }
}

/** 取得した結果を value object に変える。取得元に無いか、画像として受け付けられなければ RuleViolation を投げる。 */
function parseFetched(fetched: FetchedSourceImage | SourceImageNotFound) {
  ensure(fetched.kind === "fetched", "取得元に画像がない");
  return {
    contentType: ImageContentType(fetched.contentType),
    dimensions: ImageDimensions({ width: fetched.width, height: fetched.height }),
    byteSize: ByteSize(fetched.byteSize),
    etag: fetched.etag === null ? null : ETag(fetched.etag),
  };
}

/** RuleViolation を ImageSyncRejected に変える。それ以外の例外は業務の結果ではないので、そのまま投げる。 */
function rejection(error: unknown, sourceUrl: string, imageId: ImageId | null): ImageEvent[] {
  if (!(error instanceof RuleViolation)) throw error;
  return [{ type: "ImageSyncRejected", imageId, sourceUrl, reason: error.message }];
}
