import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ImageId } from "../../value-objects/image-id.js";
import { StorageKey } from "../../value-objects/storage-key.js";
import type { FetchedSourceImage, ImageCommand } from "./commands.js";
import type { Image } from "./entities/image.js";
import { type ImageEvent, changesState } from "./events.js";
import { ImageAggregate } from "./image-aggregate.js";
import type { ImageOperations } from "./operations.js";

const SOURCE_URL = "https://api.gatcg.com/cards/images/Wa5g8PP0Q1.jpg";

function fetched(overrides: Partial<FetchedSourceImage> = {}): FetchedSourceImage {
  return {
    kind: "fetched",
    contentType: "image/jpeg",
    width: 500,
    height: 700,
    byteSize: 138293,
    etag: '"etag-1"',
    ...overrides,
  };
}

/** メモリ上の repository。application と同じく、changesState に当たるイベントがあれば保存する。 */
function store() {
  const images = new Map<string, Image>();
  const ops: ImageOperations = {
    findById: async (id) => images.get(id) ?? null,
    newImageId: () => ImageId(randomUUID()),
    newStorageKey: (id) => StorageKey(`images/${id}/${randomUUID()}`),
  };
  const run = async (command: ImageCommand) => {
    const image = new ImageAggregate(ops);
    const events = await image.execute(command);
    if (events.some(changesState) && image.state) images.set(image.state.id, image.state);
    return { image, events };
  };
  const register = () =>
    run({ type: "RegisterSourceImage", sourceUrl: SOURCE_URL, fetched: fetched() });
  return { run, register };
}

const types = (events: readonly ImageEvent[]) => events.map((e) => e.type);

describe("RegisterSourceImage", () => {
  it("取得した画像を ImageRegistered で登録し、ETag を取得元の情報として持つ", async () => {
    const { register } = store();
    const { image, events } = await register();
    expect(types(events)).toEqual(["ImageRegistered"]);
    expect(image.state).toMatchObject({
      contentType: "image/jpeg",
      dimensions: { width: 500, height: 700 },
      source: { url: SOURCE_URL, etag: '"etag-1"' },
    });
    expect(image.state).not.toHaveProperty("etag");
  });

  it("取得元に無いか、画像でなければ ImageSyncRejected にし、状態を作らない", async () => {
    const { run } = store();
    for (const result of [{ kind: "notFound" as const }, fetched({ contentType: "text/html" })]) {
      const { image, events } = await run({
        type: "RegisterSourceImage",
        sourceUrl: SOURCE_URL,
        fetched: result,
      });
      expect(events).toMatchObject([{ type: "ImageSyncRejected", imageId: null }]);
      expect(image.state).toBeNull();
    }
  });
});

describe("RefreshSourceImage", () => {
  it("304 なら ImageUnchanged、取得し直せば新しいキーで ImageReplaced を出す", async () => {
    const { run, register } = store();
    const registered = (await register()).image.state!;

    const unchanged = await run({
      type: "RefreshSourceImage",
      imageId: registered.id,
      sourceUrl: SOURCE_URL,
      fetched: { kind: "notModified" },
    });
    expect(types(unchanged.events)).toEqual(["ImageUnchanged"]);

    const replaced = await run({
      type: "RefreshSourceImage",
      imageId: registered.id,
      sourceUrl: SOURCE_URL,
      fetched: fetched({ etag: '"etag-2"' }),
    });
    expect(replaced.events).toMatchObject([
      { type: "ImageReplaced", previousStorageKey: registered.storageKey },
    ]);
    expect(replaced.image.state?.id).toBe(registered.id);
    expect(replaced.image.state?.storageKey).not.toBe(registered.storageKey);
  });

  it("取得元から消えていたら拒否し、保存済みの画像を残す", async () => {
    const { run, register } = store();
    const registered = (await register()).image.state!;
    const { image, events } = await run({
      type: "RefreshSourceImage",
      imageId: registered.id,
      sourceUrl: SOURCE_URL,
      fetched: { kind: "notFound" },
    });
    expect(events).toMatchObject([{ type: "ImageSyncRejected", imageId: registered.id }]);
    expect(image.state).toEqual(registered);
  });

  it("SOURCE_URL が変わったのに 304 を送ると、拒否ではなく例外を投げる", async () => {
    const { run, register } = store();
    const registered = (await register()).image.state!;
    await expect(
      run({
        type: "RefreshSourceImage",
        imageId: registered.id,
        sourceUrl: `${SOURCE_URL}?moved`,
        fetched: { kind: "notModified" },
      }),
    ).rejects.toThrow("前の ETag");
  });
});
