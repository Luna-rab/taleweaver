import { isDeepStrictEqual } from "node:util";

import { CalendarDate } from "../../value-objects/calendar-date.js";
import type { CardId } from "../../value-objects/card-id.js";
import { CardReference, referenceKey, sameReference } from "../../value-objects/card-reference.js";
import type { CardSetId } from "../../value-objects/card-set-id.js";
import { CollectorNumber } from "../../value-objects/collector-number.js";
import { FaceSide } from "../../value-objects/face-side.js";
import { Legality } from "../../value-objects/legality.js";
import { Rarity } from "../../value-objects/rarity.js";
import { ReferenceKind } from "../../value-objects/reference-kind.js";
import { RulingDescription } from "../../value-objects/ruling-description.js";
import { RulingTitle } from "../../value-objects/ruling-title.js";
import { isErrata, Ruling, sameRuling } from "../../value-objects/ruling.js";
import { Slug } from "../../value-objects/slug.js";
import { SourceId } from "../../value-objects/source-id.js";
import { ensure } from "../../value-objects/utils/rule-violation.js";
import { accepted, type Decision, decide } from "../decision.js";
import type {
  AttachEditionImage,
  CardCommand,
  CardEditionSnapshot,
  CardSnapshot,
  SyncCard,
  WithdrawCard,
} from "./commands.js";
import { type ParsedCardEditionFace, parseCardEditionFace } from "./entities/card-edition-face.js";
import type { CardEdition } from "./entities/card-edition.js";
import { type CardFace, parseCardFace } from "./entities/card-face.js";
import type { Card } from "./entities/card.js";
import type { CardEvent, LegalityChange } from "./events.js";
import type { CardOperations } from "./operations.js";

/**
 * ルール上の 1 枚のカードを扱う集約。ルートの Card エンティティから、面・裁定・参照・エディション・
 * エディションの面までを持つ。セットと画像は別の集約で、id でだけ参照する。
 *
 * 1 つのインスタンスは 1 枚のカードだけを扱う。SyncCard はカードの id を持たないので、どのカードかは
 * 最初のコマンドの照合で決まる。決まった後のコマンドは DB ではなく state と照合し、別のカードに当たれば例外を投げる。
 * DB と照合すると、まだ保存していない登録や改訂を見落とすため。
 */
export class CardAggregate {
  readonly #ops: CardOperations;
  #state: Card | null = null;

  constructor(ops: CardOperations) {
    this.#ops = ops;
  }

  /** このインスタンスが扱うカードの、最後のコマンドを処理した後の状態。拒否したときは前の状態のまま。 */
  get state(): Card | null {
    return this.#state;
  }

  async execute(command: CardCommand): Promise<Decision<CardEvent>> {
    switch (command.type) {
      case "SyncCard":
        return await decide(() => this.#sync(command));
      case "WithdrawCard":
        return accepted(await this.#withdraw(command));
      case "AttachEditionImage":
        return accepted(await this.#attachImage(command));
    }
  }

  /**
   * 取得元のカード 1 枚分を保存済みのカードと照合し、次の状態を組み立て、比べてイベントを決める。
   * 保存していなければ CardRegistered、同じなら空の配列、違えば違う箇所ごとのイベントを返す。
   * 比べる前に両方を normalize し、配列の並び順だけの違いを「変わった」と判定しない。
   * 規則を確かめ終えてから state を書き換えるので、拒否したとき state は前の状態のまま。
   */
  async #sync(command: SyncCard): Promise<readonly CardEvent[]> {
    const parsed = parseSnapshot(command.snapshot);
    const found = await this.#findExisting(parsed.front);
    const existing = found && normalize(found);
    // 両面カードが片面になることも、片面カードに裏面が付くこともない。取得元の誤りとして拒否し、
    // 取り下げて残すエディションの面の組がカードの面の組とずれないようにする。
    if (existing !== null) {
      const sides = facesWithSide(existing).map((f) => f.side);
      ensure(
        (existing.back === null) === (parsed.back === null),
        `面の組が保存済みのカード（${sides.join("・")}）から変わった`,
      );
    }
    const editions = await this.#mergeEditions(parsed.editions, existing, command.syncedAt);
    const next = normalize({
      id: existing?.id ?? this.#ops.newCardId(),
      front: parsed.front,
      back: parsed.back,
      legality: parsed.legality,
      rulings: parsed.rulings,
      references: parsed.references,
      editions: editions.state,
      withdrawnAt: null,
    });

    if (existing === null) {
      this.#state = next;
      return [{ type: "CardRegistered", cardId: next.id, card: next }];
    }
    if (isDeepStrictEqual(next, existing)) {
      this.#state = existing;
      return [];
    }

    const events = [...diffEvents(existing, next), ...editions.events];
    // 状態の変化はどれもイベントで表す約束なので、イベントのない変化はこの集約の誤り。
    if (events.length === 0)
      throw new Error(`カード ${existing.id} の状態が変わったのにイベントがない`);
    this.#state = next;
    return events;
  }

  /**
   * カードに取り下げた時刻を付ける。すでに取り下げていれば空の配列を返す。
   * 取り下げるカードは selectCardsToWithdraw が保存済みのものから選ぶので、見つからないのは手順の誤りとして例外にする。
   */
  async #withdraw(command: WithdrawCard): Promise<readonly CardEvent[]> {
    const existing = await this.#load(command.cardId);
    if (existing.withdrawnAt !== null) {
      this.#state = existing;
      return [];
    }

    this.#state = { ...existing, withdrawnAt: command.withdrawnAt };
    return [{ type: "CardWithdrawn", cardId: existing.id }];
  }

  /**
   * エディションの面に画像を結び付ける。同じ画像を結び付けていれば空の配列を返す。
   * 送る側は保存済みのカードから画像のない面を選ぶので、カード・エディション・面が無いか、
   * 面に別の画像が既にあるのは手順の誤りとして例外にする。
   */
  async #attachImage(command: AttachEditionImage): Promise<readonly CardEvent[]> {
    const existing = await this.#load(command.cardId);
    this.#state = existing;
    const edition = existing.editions.find((e) => e.id === command.editionId);
    const face =
      edition === undefined ? null : command.side === "front" ? edition.front : edition.back;
    if (edition === undefined || face === null) {
      throw new Error(
        `カード ${existing.id} にエディション ${command.editionId} の ${command.side} の面がない`,
      );
    }
    if (face.imageId === command.imageId) return [];
    // 絵や取得元の URL が変わっても、同じ画像を差し替えるので結び付け直さない。別の画像が来るのは
    // application の誤りで、受け付けると前の画像がどこからも参照されずに残る。
    if (face.imageId !== null) {
      throw new Error(
        `エディション ${edition.id} の ${command.side} の面には、既に画像 ${face.imageId} を結び付けている`,
      );
    }

    const attached = { ...face, imageId: command.imageId };
    const updated =
      command.side === "front" ? { ...edition, front: attached } : { ...edition, back: attached };
    this.#state = {
      ...existing,
      editions: existing.editions.map((e) => (e === edition ? updated : e)),
    };
    return [
      {
        type: "CardEditionImageAttached",
        cardId: existing.id,
        editionId: edition.id,
        side: command.side,
        imageId: command.imageId,
      },
    ];
  }

  /** id を指定したコマンドの対象を読む。別のカードを扱うインスタンスに送られたら、application の誤りとして例外にする。 */
  async #load(cardId: CardId): Promise<Card> {
    if (this.#state !== null && this.#state.id !== cardId) {
      throw new Error(
        `カード ${this.#state.id} を扱うインスタンスに、別のカード ${cardId} のコマンドが送られた`,
      );
    }
    const found = this.#state ?? (await this.#ops.findById(cardId));
    if (found === null) throw new Error(`カードがない: ${cardId}`);
    return normalize(found);
  }

  /**
   * 表の面の sourceId で探し、見つからなければ slug で探す（取得元が id を振り直したとき）。slug で見つけた
   * カードの元の sourceId が今回の取得に残っていれば拒否する。このインスタンスがすでにカードを扱っていれば、DB ではなくそのカードと照合する。
   */
  async #findExisting(front: CardFace): Promise<Card | null> {
    const current = this.#state;
    if (current !== null) {
      const currentFront = current.front;
      if (currentFront.sourceId === front.sourceId) return current;
      // 別のカードに当たるのは、インスタンスを使い回した application の誤りなので、拒否ではなく例外にする。
      if (currentFront.slug !== front.slug) {
        throw new Error(
          `カード ${current.id} を扱うインスタンスに、別のカード（sourceId ${front.sourceId}）の同期が送られた`,
        );
      }
      await this.#ensureSourceIdReassigned(front.slug, currentFront.sourceId);
      return current;
    }

    const bySourceId = await this.#ops.findByFrontSourceId(front.sourceId);
    if (bySourceId !== null) return bySourceId;

    const bySlug = await this.#ops.findByFrontSlug(front.slug);
    if (bySlug !== null) await this.#ensureSourceIdReassigned(front.slug, bySlug.front.sourceId);
    return bySlug;
  }

  /**
   * slug で見つかったカードの元の sourceId が今回の取得にも残っているなら、スナップショットは slug が重なった
   * 別のカード。id の振り直しではないので拒否する。
   */
  async #ensureSourceIdReassigned(slug: Slug, previousSourceId: SourceId): Promise<void> {
    ensure(
      !(await this.#ops.isInCurrentFetch(previousSourceId)),
      `slug ${slug} のカードは sourceId ${previousSourceId} で既にあり、その sourceId も今回の取得に残っている`,
    );
  }

  /**
   * 取得したエディションを保存しているエディションと照合し、次のエディションの一覧とイベントを返す。
   * 新しいカードのとき（existing が null）は CardRegistered が全体を表すので、エディションのイベントは出さない。
   */
  async #mergeEditions(
    parsed: readonly ParsedEdition[],
    existing: Card | null,
    syncedAt: Date,
  ): Promise<{ state: CardEdition[]; events: CardEvent[] }> {
    const cardId = existing?.id ?? null;
    const previous = existing?.editions ?? [];
    const incomingSourceIds = new Set(parsed.map((e) => e.front.sourceId));
    const matches = parsed.map((edition) => ({
      edition,
      match: matchEdition(edition, previous, incomingSourceIds),
    }));

    // セットを先に全部引いてから id を振る。並行に引きながら振ると、UUID v7 の時刻順が取得元の並び順とずれるため。
    const setIds = await Promise.all(matches.map(({ edition }) => this.#setIdOf(edition)));
    const kept = matches.map(({ edition, match }, i) =>
      this.#mergeEdition(edition, match, setIds[i]!, cardId),
    );
    const gone =
      existing === null
        ? []
        : existing.editions
            .filter((p) => !matches.some(({ match }) => match === p))
            .map((edition) => withdrawEdition(edition, existing.id, syncedAt));
    const results = [...kept, ...gone];
    return { state: results.map((r) => r.edition), events: results.flatMap((r) => r.events) };
  }

  async #setIdOf(edition: ParsedEdition): Promise<CardSetId> {
    const setId = await this.#ops.findSetIdBySourceId(edition.setSourceId);
    // セットはジョブが先に同期する。無いのは手順の誤りなので、拒否ではなく例外にする。
    if (setId === null) throw new Error(`セットが同期されていない: ${edition.setSourceId}`);
    return setId;
  }

  /** 取得したエディションを、照合できた既存のエディション（なければ新しい id）に重ねる。 */
  #mergeEdition(
    edition: ParsedEdition,
    match: CardEdition | undefined,
    setId: CardSetId,
    cardId: CardId | null,
  ): EditionResult {
    const merged: CardEdition = {
      id: match?.id ?? this.#ops.newCardEditionId(),
      setId,
      collectorNumber: edition.collectorNumber,
      rarity: edition.rarity,
      isDefault: edition.isDefault,
      withdrawnAt: null,
      // 画像は取得元のスナップショットに無いので、同じ側の既存の面から引き継ぐ。
      front: { ...edition.front, imageId: match?.front.imageId ?? null },
      back:
        edition.back === null ? null : { ...edition.back, imageId: match?.back?.imageId ?? null },
    };
    return { edition: merged, events: cardId === null ? [] : editionEvents(cardId, match, merged) };
  }
}

type EditionResult = { readonly edition: CardEdition; readonly events: readonly CardEvent[] };

/**
 * 表の面の sourceId で照合し、見つからなければ slug で照合する。
 * slug で見つかったエディションの元の sourceId が今回の取得にも残っているなら、id の振り直しではないので拒否する。
 */
function matchEdition(
  edition: ParsedEdition,
  previous: readonly CardEdition[],
  incomingSourceIds: ReadonlySet<SourceId>,
): CardEdition | undefined {
  const front = edition.front;
  const bySourceId = previous.find((p) => p.front.sourceId === front.sourceId);
  if (bySourceId !== undefined) return bySourceId;

  const bySlug = previous.find((p) => p.front.slug === front.slug);
  if (bySlug === undefined) return undefined;
  const previousSourceId = bySlug.front.sourceId;
  ensure(
    !incomingSourceIds.has(previousSourceId),
    `エディションの slug ${front.slug} は sourceId ${previousSourceId} で既にあり、その sourceId も今回の取得に残っている`,
  );
  return bySlug;
}

/** 既存のカードのエディション 1 つについて、照合の結果からイベントを決める。 */
function editionEvents(
  cardId: CardId,
  match: CardEdition | undefined,
  merged: CardEdition,
): CardEvent[] {
  if (match === undefined) {
    return [
      {
        type: "CardEditionAdded",
        cardId,
        editionId: merged.id,
        faces: facesWithSide(merged).map(({ side, face }) => ({
          side,
          sourceId: face.sourceId,
          imageSourcePath: face.imageSourcePath,
        })),
      },
    ];
  }
  return [
    ...(match.withdrawnAt === null
      ? []
      : [{ type: "CardEditionReinstated" as const, cardId, editionId: merged.id }]),
    // 取り下げていた間は既定から外しているので、戻ったときの既定の変化も Revised で表す。
    ...(isDeepStrictEqual({ ...match, withdrawnAt: null }, merged)
      ? []
      : [{ type: "CardEditionRevised" as const, cardId, before: match, after: merged }]),
  ];
}

/** 取得に無かった保存済みのエディションに、取り下げた時刻を付けて既定から外す。 */
function withdrawEdition(edition: CardEdition, cardId: CardId, syncedAt: Date): EditionResult {
  return {
    edition: { ...edition, isDefault: false, withdrawnAt: edition.withdrawnAt ?? syncedAt },
    events:
      edition.withdrawnAt === null
        ? [{ type: "CardEditionWithdrawn", cardId, editionId: edition.id }]
        : [],
  };
}

/** カード本体（エディション以外）の前後を比べ、違う箇所ごとのイベントを返す。 */
function diffEvents(before: Card, after: Card): CardEvent[] {
  const cardId = after.id;
  const changes = diffLegality(before.legality, after.legality);
  return [
    ...(before.withdrawnAt === null ? [] : [{ type: "CardReinstated" as const, cardId }]),
    ...faceEvents(cardId, FaceSide("front"), before.front, after.front),
    // #sync が面の組が変わらないことを確かめているので、裏面は前後の両方にあるか、両方にない。
    ...(before.back !== null && after.back !== null
      ? faceEvents(cardId, FaceSide("back"), before.back, after.back)
      : []),
    ...rulingEvents(cardId, before.rulings, after.rulings),
    ...referenceEvents(cardId, before.references, after.references),
    ...(changes.length === 0 ? [] : [{ type: "CardLegalityChanged" as const, cardId, changes }]),
  ];
}

/** 同じ側の面の前後を、ルールに関わる特性とそれ以外に分けて比べる。 */
function faceEvents(
  cardId: CardId,
  side: FaceSide,
  before: CardFace,
  after: CardFace,
): CardEvent[] {
  return [
    ...(isDeepStrictEqual(before.characteristics, after.characteristics)
      ? []
      : [
          {
            type: "CardCharacteristicsChanged" as const,
            cardId,
            side,
            before: before.characteristics,
            after: after.characteristics,
          },
        ]),
    ...(isDeepStrictEqual({ ...before, characteristics: null }, { ...after, characteristics: null })
      ? []
      : [{ type: "CardFaceRevised" as const, cardId, side, before, after }]),
  ];
}

/** 面を、どちらの側かと組にして表、裏の順に返す。片面なら表だけ。 */
function facesWithSide<F>(x: {
  readonly front: F;
  readonly back: F | null;
}): { readonly side: FaceSide; readonly face: F }[] {
  return [
    { side: FaceSide("front"), face: x.front },
    ...(x.back === null ? [] : [{ side: FaceSide("back"), face: x.back }]),
  ];
}

function rulingEvents(
  cardId: CardId,
  before: readonly Ruling[],
  after: readonly Ruling[],
): CardEvent[] {
  const added = after.filter((r) => !before.some((b) => sameRuling(b, r)));
  const removed = before.filter((r) => !after.some((a) => sameRuling(a, r)));
  // 増えた・消えた裁定を除き、両方に残った裁定の順で比べる。増減と並び替えが同時に起きても並び替えを知らせるため。
  // 重複がなければ、残った裁定は前後で同じ集まりになる。after は parseSnapshot が重複を拒否し、
  // before も保存する前に同じ確認を通っている。
  const keptBefore = before.filter((r) => !removed.includes(r));
  const keptAfter = after.filter((r) => !added.includes(r));
  return [
    ...added.map((ruling) => ({
      type: "CardRulingAdded" as const,
      cardId,
      ruling,
      isErrata: isErrata(ruling),
    })),
    ...removed.map((ruling) => ({ type: "CardRulingRemoved" as const, cardId, ruling })),
    ...(isDeepStrictEqual(keptBefore, keptAfter)
      ? []
      : [{ type: "CardRulingsReordered" as const, cardId, rulings: after }]),
  ];
}

function referenceEvents(
  cardId: CardId,
  before: readonly CardReference[],
  after: readonly CardReference[],
): CardEvent[] {
  const added = after.filter((r) => !before.some((b) => sameReference(b, r)));
  const removed = before.filter((r) => !after.some((a) => sameReference(a, r)));
  return added.length === 0 && removed.length === 0
    ? []
    : [{ type: "CardReferencesChanged", cardId, added, removed }];
}

/** 上限が変わったフォーマットを、名前の順に返す。 */
function diffLegality(before: Legality, after: Legality): LegalityChange[] {
  const formats = [...new Set([...Object.keys(before), ...Object.keys(after)])].toSorted();
  return (
    formats
      // Object.hasOwn で自分のキーだけを読む。"constructor" のようなフォーマット名で、継承した関数を拾わないため。
      .map((format) => ({
        format,
        before: Object.hasOwn(before, format) ? before[format]! : null,
        after: Object.hasOwn(after, format) ? after[format]! : null,
      }))
      .filter((c) => c.before !== c.after)
  );
}

type ParsedEdition = Omit<CardEdition, "id" | "setId" | "withdrawnAt" | "front" | "back"> & {
  readonly setSourceId: SourceId;
  readonly front: ParsedCardEditionFace;
  readonly back: ParsedCardEditionFace | null;
};

/**
 * 取得元のカード 1 枚分を value object とエンティティに変え、カードとエディションをまたぐ規則を確かめる。
 * 規則に合わなければ RuleViolation を投げる（execute が rejected に変える）。
 */
function parseSnapshot(snapshot: CardSnapshot) {
  const front = parseCardFace(snapshot.front);
  const back = snapshot.back === null ? null : parseCardFace(snapshot.back);

  ensure(snapshot.editions.length > 0, "エディションが 1 つもない");
  for (const edition of snapshot.editions) {
    ensure(
      (edition.back === null) === (snapshot.back === null),
      `エディション ${edition.front.sourceId} の面の組がカードの面の組とそろわない`,
    );
  }
  const editions = snapshot.editions.map(parseEdition);
  ensure(editions.filter((e) => e.isDefault).length <= 1, "既定のエディションが 2 つ以上ある");

  const rulings = snapshot.rulings.map((r) =>
    Ruling({
      title: r.title === null ? null : RulingTitle(r.title),
      addedOn: CalendarDate(r.addedOn),
      description: RulingDescription(r.description),
    }),
  );
  // 裁定は 3 つの値で同じものを探すので、重複があると増減や並び替えを判定できない。
  ensure(
    rulings.every((r, i) => rulings.findIndex((o) => sameRuling(o, r)) === i),
    "同じ裁定が 2 つある",
  );

  return {
    front,
    back,
    legality: Legality(snapshot.legality),
    rulings,
    references: snapshot.references.map((r) =>
      CardReference({ kind: ReferenceKind(r.kind), targetSlug: Slug(r.targetSlug) }),
    ),
    editions,
  };
}

/**
 * 取得元のエディション 1 つ分を value object に変える。
 * id とセットの id は既存のエディションと照合してから決まるので、ここではまだエンティティにしない。
 */
function parseEdition(edition: CardEditionSnapshot): ParsedEdition {
  return {
    setSourceId: SourceId(edition.setSourceId),
    collectorNumber: CollectorNumber(edition.collectorNumber),
    rarity: Rarity(edition.rarity),
    isDefault: edition.isDefault,
    front: parseCardEditionFace(edition.front),
    back: edition.back === null ? null : parseCardEditionFace(edition.back),
  };
}

/**
 * 順序に意味のない配列を決まった順に並べる。「変更なし」の判定を、repository が返す並び順や
 * 取得元の並び順に左右させないため。裁定は並び順に意味がある（DB は position で持つ）ので並べ替えない。
 * 参照は (kind, targetSlug) が主キーなので、重複を除く。
 */
function normalize(state: Card): Card {
  const references = new Map(state.references.map((r) => [referenceKey(r), r]));
  return {
    ...state,
    references: [...references.entries()].toSorted(([a], [b]) => compare(a, b)).map(([, r]) => r),
    editions: state.editions.toSorted((a, b) => compare(a.front.sourceId, b.front.sourceId)),
  };
}

/**
 * 文字コードの順で比べる。localeCompare は実行環境のロケールで順が変わり、
 * 環境が変わると同じデータでも「並びが変わった」と判定してしまうので使わない。
 */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
