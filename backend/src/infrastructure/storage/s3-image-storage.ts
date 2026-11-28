import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import type { ImageStorage } from "../../application/ports/image-storage.js";
import type { ImageContentType } from "../../domain/value-objects/image-content-type.js";
import type { StorageKey } from "../../domain/value-objects/storage-key.js";
import type { Config } from "../config.js";

/** S3 互換のストレージ。開発では SeaweedFS、本番では AWS の S3 に置く。 */
export class S3ImageStorage implements ImageStorage {
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(config: Config) {
    this.#client = new S3Client({
      region: config.S3_REGION,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      ...(config.S3_ENDPOINT === undefined ? {} : { endpoint: config.S3_ENDPOINT }),
      ...(config.s3Credentials === null ? {} : { credentials: config.s3Credentials }),
    });
    this.#bucket = config.IMAGES_BUCKET;
  }

  async put(key: StorageKey, bytes: Uint8Array, contentType: ImageContentType): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
  }

  async delete(key: StorageKey): Promise<void> {
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }));
  }
}
