import { ByteSize } from "../../value-objects/byte-size.js";
import { ETag } from "../../value-objects/etag.js";
import { ImageContentType } from "../../value-objects/image-content-type.js";
import { ImageDimensions } from "../../value-objects/image-dimensions.js";
import type { ImageId } from "../../value-objects/image-id.js";
import { ensure } from "../../value-objects/utils/rule-violation.js";
import { accepted, type Decision, decide } from "../decision.js";
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
 * application は、accepted の events が空でなければ、ファイルを置いてから state を repository.save に渡す。
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

  async execute(command: ImageCommand): Promise<Decision<ImageEvent>> {
    switch (command.type) {
      case "RegisterSourceImage":
        return await this.#register(command);
      case "RefreshSourceImage":
        return await this.#refresh(command);
    }
  }

  /** 取得元の画像を新しい画像として登録する。取得元に無いか、画像として受け付けられなければ拒否する。 */
  async #register(command: RegisterSourceImage): Promise<Decision<ImageEvent>> {
    if (this.#state !== null) {
      throw new Error(`画像 ${this.#state.id} を扱うインスタンスに、新しい画像の登録が送られた`);
    }
    return await decide(() => {
      const fetched = parseFetched(command.fetched);
      const id = this.#ops.newImageId();
      this.#state = this.#toImage(id, 0, fetched);
      return [{ type: "ImageRegistered", imageId: id }];
    });
  }

  /**
   * 保存済みの画像を取得元に問い合わせた結果を反映する。304 なら空の events、取得できれば新しいキーで
   * ImageReplaced を返す。取得元から消えていたら拒否し、保存済みの画像は残す。
   */
  async #refresh(command: RefreshSourceImage): Promise<Decision<ImageEvent>> {
    const existing = await this.#load(command.imageId);
    this.#state = existing;
    if (existing.source === null) {
      throw new Error(`画像 ${existing.id} はアップロードされたもので、取得元がない`);
    }
    if (command.fetched.kind === "notModified") return accepted([]);
    const fetched = command.fetched;
    return await decide(() => {
      this.#state = this.#toImage(existing.id, existing.version, parseFetched(fetched));
      return [
        { type: "ImageReplaced", imageId: existing.id, previousStorageKey: existing.storageKey },
      ];
    });
  }

  /** 取得した画像に新しいストレージのキーを振る。 */
  #toImage(id: ImageId, version: number, { etag, ...file }: ParsedFetched): Image {
    return {
      id,
      version,
      storageKey: this.#ops.newStorageKey(id, file.contentType),
      ...file,
      source: { etag },
    };
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

type ParsedFetched = ReturnType<typeof parseFetched>;

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
