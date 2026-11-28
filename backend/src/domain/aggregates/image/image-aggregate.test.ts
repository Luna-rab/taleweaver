import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ImageId } from "../../value-objects/image-id.js";
import { StorageKey } from "../../value-objects/storage-key.js";
import type { Decision } from "../decision.js";
import type { FetchedSourceImage, ImageCommand } from "./commands.js";
import type { Image } from "./entities/image.js";
import type { ImageEvent } from "./events.js";
import { ImageAggregate } from "./image-aggregate.js";
import type { ImageOperations } from "./operations.js";

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

/** メモリ上の repository。application と同じく、accepted の events が空でなければ保存する。 */
function store() {
  const images = new Map<string, Image>();
  const ops: ImageOperations = {
    findById: async (id) => images.get(id) ?? null,
    newImageId: () => ImageId(randomUUID()),
    newStorageKey: (id) => StorageKey(`images/${id}/${randomUUID()}`),
  };
  const run = async (command: ImageCommand) => {
    const image = new ImageAggregate(ops);
    const decision = await image.execute(command);
    if (decision.kind === "accepted" && decision.events.length > 0 && image.state) {
      images.set(image.state.id, image.state);
    }
    return { image, decision };
  };
  const register = () => run({ type: "RegisterSourceImage", fetched: fetched() });
  return { images, run, register };
}

/** accepted の events を返す。rejected なら reason を載せて失敗させる。 */
function eventsOf(decision: Decision<ImageEvent>): readonly ImageEvent[] {
  if (decision.kind === "rejected") throw new Error(`rejected: ${decision.reason}`);
  return decision.events;
}

const types = (decision: Decision<ImageEvent>) => eventsOf(decision).map((e) => e.type);

describe("RegisterSourceImage", () => {
  it("取得した画像を ImageRegistered で登録し、ETag を取得元の情報として持つ", async () => {
    const { register } = store();
    const { image, decision } = await register();
    expect(types(decision)).toEqual(["ImageRegistered"]);
    expect(image.state).toMatchObject({
      version: 0,
      contentType: "image/jpeg",
      dimensions: { width: 500, height: 700 },
      source: { etag: '"etag-1"' },
    });
    expect(image.state).not.toHaveProperty("etag");
  });

  it("取得元に無いか、画像でなければ rejected にし、状態を作らない", async () => {
    const { run } = store();
    for (const [result, reason] of [
      [{ kind: "notFound" as const }, "取得元に画像がない"],
      [fetched({ contentType: "text/html" }), "画像ではない: text/html"],
    ] as const) {
      const { image, decision } = await run({ type: "RegisterSourceImage", fetched: result });
      expect(decision).toEqual({ kind: "rejected", reason });
      expect(image.state).toBeNull();
    }
  });
});

describe("RefreshSourceImage", () => {
  it("304 ならイベントなし、取得し直せば新しいキーで ImageReplaced を出し、版は読んだときのまま", async () => {
    const { images, run, register } = store();
    const registered = (await register()).image.state!;
    images.set(registered.id, { ...registered, version: 3 });

    const unchanged = await run({
      type: "RefreshSourceImage",
      imageId: registered.id,
      fetched: { kind: "notModified" },
    });
    expect(unchanged.decision).toEqual({ kind: "accepted", events: [] });

    const replaced = await run({
      type: "RefreshSourceImage",
      imageId: registered.id,
      fetched: fetched({ etag: '"etag-2"' }),
    });
    expect(eventsOf(replaced.decision)).toMatchObject([
      { type: "ImageReplaced", previousStorageKey: registered.storageKey },
    ]);
    expect(replaced.image.state).toMatchObject({ id: registered.id, version: 3 });
    expect(replaced.image.state?.storageKey).not.toBe(registered.storageKey);
  });

  it("取得元から消えていたら拒否し、保存済みの画像を残す", async () => {
    const { run, register } = store();
    const registered = (await register()).image.state!;
    const { image, decision } = await run({
      type: "RefreshSourceImage",
      imageId: registered.id,
      fetched: { kind: "notFound" },
    });
    expect(decision).toEqual({ kind: "rejected", reason: "取得元に画像がない" });
    expect(image.state).toEqual(registered);
  });
});
