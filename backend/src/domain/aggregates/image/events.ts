import type { ImageId } from "../../value-objects/image-id.js";
import type { StorageKey } from "../../value-objects/storage-key.js";
import type { Image } from "./entities/image.js";

/** 新しい画像を登録した。application は保存の前に、ファイルを image.storageKey に置く。 */
export type ImageRegistered = {
  readonly type: "ImageRegistered";
  readonly imageId: ImageId;
  readonly image: Image;
};

/**
 * 取得元の絵が差し替わった。application は保存の前に新しいファイルを image.storageKey に置き、
 * 保存した後に previousStorageKey のファイルを消す。
 */
export type ImageReplaced = {
  readonly type: "ImageReplaced";
  readonly imageId: ImageId;
  readonly previousStorageKey: StorageKey;
  readonly image: Image;
};

/** 取得元が 304 を返した。 */
export type ImageUnchanged = {
  readonly type: "ImageUnchanged";
  readonly imageId: ImageId;
};

/**
 * 取得元に画像が無いか、画像として受け付けられないので、反映を拒否した。状態は前回のまま。
 * 登録を拒否したときは imageId が null。
 */
export type ImageSyncRejected = {
  readonly type: "ImageSyncRejected";
  readonly imageId: ImageId | null;
  readonly sourceUrl: string;
  readonly reason: string;
};

export type ImageEvent = ImageRegistered | ImageReplaced | ImageUnchanged | ImageSyncRejected;

/** 状態を変えたイベントか。application は、これに当たるイベントがあれば repository.save を呼ぶ。 */
export function changesState(event: ImageEvent): boolean {
  return event.type !== "ImageUnchanged" && event.type !== "ImageSyncRejected";
}
