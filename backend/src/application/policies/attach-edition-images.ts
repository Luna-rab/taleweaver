import { CardAggregate } from "../../domain/aggregates/card/card-aggregate.js";
import type { Card } from "../../domain/aggregates/card/entities/card.js";
import type { CardEditionAdded, CardRegistered } from "../../domain/aggregates/card/events.js";
import type { CardOperations } from "../../domain/aggregates/card/operations.js";
import { ImageAggregate } from "../../domain/aggregates/image/image-aggregate.js";
import type { ImageOperations } from "../../domain/aggregates/image/operations.js";
import type { IdGenerator } from "../../domain/ports/id-generator.js";
import type { CardEditionId } from "../../domain/value-objects/card-edition-id.js";
import type { CardId } from "../../domain/value-objects/card-id.js";
import { FaceSide } from "../../domain/value-objects/face-side.js";
import type { ImageSourcePath } from "../../domain/value-objects/image-source-path.js";
import type { ImageStorage } from "../ports/image-storage.js";
import type { Logger } from "../ports/logger.js";
import type { SourceImageFetcher } from "../ports/source-image-fetcher.js";
import type { Transaction, UnitOfWork } from "../ports/unit-of-work.js";
import type { JobHandler } from "../process-jobs.js";

export type AttachEditionImagesDeps = {
  readonly unitOfWork: UnitOfWork;
  readonly fetcher: SourceImageFetcher;
  readonly storage: ImageStorage;
  readonly ids: IdGenerator;
  readonly newStorageKey: ImageOperations["newStorageKey"];
  readonly logger: Logger;
  readonly now: () => Date;
};

type TargetFace = {
  readonly editionId: CardEditionId;
  readonly side: FaceSide;
  readonly imageSourcePath: ImageSourcePath;
};

/**
 * CardRegistered と CardEditionAdded を受けて、エディションの面の画像を取得し、保存して面に結び付ける。
 * イベントは id しか持たないので、今のカードを読み、画像のない面だけを選ぶ。そのため何度試しても、
 * 結び付け終えた面を取り直さない。
 */
export function attachEditionImages(deps: AttachEditionImagesDeps): JobHandler {
  return async (job) => {
    const event = await deps.unitOfWork.run((tx) => tx.events.findById(job.payload.eventId));
    if (event === null) throw new Error(`イベントがない: ${job.payload.eventId}`);
    const trigger = toTrigger(event);
    const card = await deps.unitOfWork.run((tx) => tx.cards.findById(trigger.cardId));
    if (card === null) throw new Error(`カードがない: ${trigger.cardId}`);
    await facesToAttach(card, trigger.editionId).reduce(async (done, face) => {
      await done;
      await attachFace(deps, card.id, face);
    }, Promise.resolve());
  };
}

/** subscriptions.ts でこのポリシーに結んだイベントだけが来る。 */
function toTrigger(event: { readonly type: string }): {
  cardId: CardId;
  editionId: CardEditionId | null;
} {
  switch (event.type) {
    case "CardRegistered":
      return { cardId: (event as CardRegistered).cardId, editionId: null };
    case "CardEditionAdded": {
      const { cardId, editionId } = event as CardEditionAdded;
      return { cardId, editionId };
    }
    default:
      throw new Error(`attach-edition-images が受けないイベント: ${event.type}`);
  }
}

/**
 * editionId が null ならカードの全エディション、そうでなければそのエディションから、画像のない面を選ぶ。
 * 取り下げたエディションは選ばない。取得元から消えたエディションの画像は取得元にも無いため。
 */
function facesToAttach(card: Card, editionId: CardEditionId | null): readonly TargetFace[] {
  return card.editions
    .filter((e) => e.withdrawnAt === null && (editionId === null || e.id === editionId))
    .flatMap((e) =>
      [
        { side: FaceSide("front"), face: e.front },
        ...(e.back === null ? [] : [{ side: FaceSide("back"), face: e.back }]),
      ]
        .filter(({ face }) => face.imageId === null)
        .map(({ side, face }) => ({
          editionId: e.id,
          side,
          imageSourcePath: face.imageSourcePath,
        })),
    );
}

/**
 * 面 1 つの画像を取得し、ファイルを置いてから、画像と面への結び付けを 1 つのトランザクションで保存する。
 * 保存に失敗するとファイルだけが残るが、どこからも参照されないので害はない。
 */
async function attachFace(deps: AttachEditionImagesDeps, cardId: CardId, face: TargetFace) {
  const download = await deps.fetcher.fetch(face.imageSourcePath);
  const image = new ImageAggregate({
    findById: (id) => deps.unitOfWork.run((tx) => tx.images.findById(id)),
    newImageId: () => deps.ids.newImageId(),
    newStorageKey: deps.newStorageKey,
  });
  const decision = await image.execute({ type: "RegisterSourceImage", fetched: download.result });
  if (decision.kind === "rejected") {
    // 面は画像のないまま残る。もう一度取得させるイベントが出るまで取り直さない。
    deps.logger.warn("画像を登録しなかった", { cardId, ...face, reason: decision.reason });
    return;
  }
  // accepted になるのは取得できたときだけなので、bytes がある。
  const { bytes } = download as { readonly bytes: Uint8Array };
  const state = image.state!;
  await deps.storage.put(state.storageKey, bytes, state.contentType);

  await deps.unitOfWork.run(async (tx) => {
    const occurredAt = deps.now();
    await tx.images.save(state);
    await tx.events.append({ type: "image", id: state.id }, decision.events, occurredAt);

    const card = new CardAggregate(cardOperations(tx, deps.ids));
    const attached = await card.execute({
      type: "AttachEditionImage",
      cardId,
      editionId: face.editionId,
      side: face.side,
      imageId: state.id,
    });
    // AttachEditionImage は拒否しない。
    if (attached.kind === "accepted" && attached.events.length > 0) {
      await tx.cards.save(card.state!);
      await tx.events.append({ type: "card", id: cardId }, attached.events, occurredAt);
    }
  });
}

/** AttachEditionImage が使うのは findById だけ。同期のための操作は、呼ばれたら誤りなので例外にする。 */
function cardOperations(tx: Transaction, ids: IdGenerator): CardOperations {
  return {
    findById: (id) => tx.cards.findById(id),
    findByFrontSourceId: (s) => tx.cards.findByFrontSourceId(s),
    findByFrontSlug: (s) => tx.cards.findByFrontSlug(s),
    isInCurrentFetch: syncOnly,
    findSetIdBySourceId: (s) => tx.cardSets.findIdBySourceId(s),
    newCardId: () => ids.newCardId(),
    newCardEditionId: () => ids.newCardEditionId(),
  };
}

function syncOnly(): never {
  throw new Error("同期のための操作が、画像の結び付けで呼ばれた");
}
