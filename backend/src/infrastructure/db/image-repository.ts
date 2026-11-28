import { and, eq, sql } from "drizzle-orm";

import { images } from "../../db/schema.js";
import type { Image } from "../../domain/aggregates/image/entities/image.js";
import type { ImageRepository } from "../../domain/ports/image-repository.js";
import { OptimisticLockError } from "../../domain/ports/optimistic-lock-error.js";
import type { ByteSize } from "../../domain/value-objects/byte-size.js";
import type { ETag } from "../../domain/value-objects/etag.js";
import type { ImageContentType } from "../../domain/value-objects/image-content-type.js";
import type { ImageDimensions } from "../../domain/value-objects/image-dimensions.js";
import type { ImageId } from "../../domain/value-objects/image-id.js";
import type { StorageKey } from "../../domain/value-objects/storage-key.js";
import type { Tx } from "./client.js";

export class DrizzleImageRepository implements ImageRepository {
  readonly #tx: Tx;

  constructor(tx: Tx) {
    this.#tx = tx;
  }

  async findById(id: ImageId): Promise<Image | null> {
    const [row] = await this.#tx.select().from(images).where(eq(images.id, id));
    if (row === undefined) return null;
    // DB の値は保存する前に集約が確かめているので、value object の検証を通さずに型だけを付ける。
    return {
      id: row.id as ImageId,
      version: row.version,
      storageKey: row.storageKey as StorageKey,
      contentType: row.contentType as ImageContentType,
      dimensions: { width: row.width, height: row.height } as ImageDimensions,
      byteSize: row.byteSize as ByteSize,
      // アップロードの機能はまだなく、画像はどれも取得元から取得したもの。アップロードを作るときに、
      // 取得元の画像かどうかを表す列を足す（source_etag の NULL は ETag を返さなかったことしか表さない）。
      source: { etag: row.sourceEtag as ETag | null },
    };
  }

  async save(image: Image): Promise<void> {
    const values = {
      storageKey: image.storageKey,
      contentType: image.contentType,
      width: image.dimensions.width,
      height: image.dimensions.height,
      byteSize: image.byteSize,
      sourceEtag: image.source?.etag ?? null,
    };
    if (image.version === 0) {
      await this.#tx.insert(images).values({ id: image.id, version: 1, ...values });
      return;
    }
    const updated = await this.#tx
      .update(images)
      .set({ ...values, version: sql`${images.version} + 1` })
      .where(and(eq(images.id, image.id), eq(images.version, image.version)))
      .returning({ id: images.id });
    if (updated.length === 0) throw new OptimisticLockError("画像", image.id, image.version);
  }
}
