import { isDeepStrictEqual } from "node:util";

import { CalendarDate } from "../../value-objects/calendar-date.js";
import type { CardId } from "../../value-objects/card-id.js";
import { CardReference } from "../../value-objects/card-reference.js";
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
import { ensure, RuleViolation } from "../../value-objects/utils/rule-violation.js";
import type {
  CardCommand,
  CardEditionSnapshot,
  CardSnapshot,
  SyncCard,
  WithdrawCard,
} from "./commands.js";
import { parseCardEditionFace } from "./entities/card-edition-face.js";
import { type CardEdition, frontEditionFace } from "./entities/card-edition.js";
import { type CardFace, parseCardFace } from "./entities/card-face.js";
import { type Card, frontFace } from "./entities/card.js";
import type { CardEvent } from "./events.js";
import type { CardOperations } from "./operations.js";

/**
 * ルール上の 1 枚のカードを扱う集約。ルートの Card エンティティから、面・裁定・参照・エディション・
 * エディションの面までを持つ。セットと画像は別の集約で、id でだけ参照する。
 *
 * execute は何が起きたかを必ず 1 件以上のイベントで返す。
 * application は changesState に当たるイベントがあれば state を repository.save に渡す。
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

  async execute(command: CardCommand): Promise<readonly CardEvent[]> {
    switch (command.type) {
      case "SyncCard":
        return await this.#syncOrReject(command);
      case "WithdrawCard":
        return await this.#withdraw(command);
    }
  }

  /**
   * 同期し、業務の規則に合わなければ CardSyncRejected を返す。
   * #sync は規則を確かめ終えてから state を書き換えるので、拒否したとき state は前の状態のまま。
   */
  async #syncOrReject(command: SyncCard): Promise<readonly CardEvent[]> {
    // 拒否の cardId には今回のコマンドで照合できたカードだけを載せるので、照合と同期の 2 段に分けて捕まえる。
    // 照合の前に拒否したときは、スナップショットがどのカードのものか分からないので null にする。
    let matched: Matched;
    try {
      matched = await this.#match(command.snapshot);
    } catch (error) {
      return rejection(error, command, null);
    }
    try {
      return await this.#sync(command, matched);
    } catch (error) {
      return rejection(error, command, matched.existing?.id ?? null);
    }
  }

  /** スナップショットを読み、保存済みのカードと照合する。見つからなければ existing は null。 */
  async #match(snapshot: CardSnapshot): Promise<Matched> {
    const parsed = parseSnapshot(snapshot);
    const found = await this.#findExisting(parsed.faces);
    // slug で見つけたカードの元の sourceId が今回の取得にも残っているなら、スナップショットは slug が重なった
    // 別のカード。見つけたカードの同期ではないので、照合の段で拒否して cardId を null にする。
    if (found?.bySlug) {
      await this.#ensureSourceIdReassigned(frontFace(parsed).slug, frontFace(found.card).sourceId);
    }
    return { parsed, existing: found && normalize(found.card) };
  }

  /**
   * 照合したカードと取得元のカード 1 枚分から次の状態を組み立て、比べてイベントを決める。
   * 保存していなければ CardRegistered、同じなら CardUnchanged、違えば違う箇所ごとのイベントを返す。
   * 比べる前に両方を normalize し、配列の並び順だけの違いを「変わった」と判定しない。
   */
  async #sync(command: SyncCard, { parsed, existing }: Matched): Promise<readonly CardEvent[]> {
    // 両面カードが片面になることも、片面カードに裏面が付くこともない。取得元の誤りとして拒否し、
    // 取り下げて残すエディションの面の組がカードの面の組とずれないようにする。
    if (existing !== null) {
      ensure(
        isDeepStrictEqual(sidesOf(existing), sidesOf(parsed)),
        `面の組が保存済みのカード（${sidesOf(existing).join("・")}）から変わった`,
      );
    }
    const editions = await this.#mergeEditions(parsed.editions, existing, command.syncedAt);
    const next = normalize({
      id: existing?.id ?? this.#ops.newCardId(),
      faces: parsed.faces,
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
      return [{ type: "CardUnchanged", cardId: existing.id }];
    }

    const events = [...diffEvents(existing, next), ...editions.events];
    // 状態の変化はどれもイベントで表す約束なので、イベントのない変化はこの集約の誤り。
    if (events.length === 0)
      throw new Error(`カード ${existing.id} の状態が変わったのにイベントがない`);
    this.#state = next;
    return events;
  }

  /**
   * カードに取り下げた時刻を付ける。すでに取り下げていれば CardUnchanged を返す。
   * 取り下げるカードは selectCardsToWithdraw が保存済みのものから選ぶので、見つからないのは手順の誤りとして例外にする。
   */
  async #withdraw(command: WithdrawCard): Promise<readonly CardEvent[]> {
    if (this.#state !== null && this.#state.id !== command.cardId) {
      throw new Error(
        `カード ${this.#state.id} を扱うインスタンスに、別のカード ${command.cardId} の取り下げが送られた`,
      );
    }
    const found = this.#state ?? (await this.#ops.findById(command.cardId));
    if (found === null) throw new Error(`取り下げるカードがない: ${command.cardId}`);
    const existing = normalize(found);
    this.#state = existing;
    if (existing.withdrawnAt !== null) return [{ type: "CardUnchanged", cardId: existing.id }];

    this.#state = { ...existing, withdrawnAt: command.withdrawnAt };
    return [{ type: "CardWithdrawn", cardId: existing.id }];
  }

  /**
   * 表の面の sourceId で探し、見つからなければ slug で探す（取得元が id を振り直したとき）。
   * このインスタンスがすでにカードを扱っていれば、DB ではなくそのカードと照合する。
   */
  async #findExisting(faces: readonly CardFace[]): Promise<Found | null> {
    const front = frontFace({ faces });
    if (this.#state !== null) return matchCurrent(this.#state, front);

    const bySourceId = await this.#ops.findByFrontSourceId(front.sourceId);
    if (bySourceId !== null) return { card: bySourceId, bySlug: false };

    const bySlug = await this.#ops.findByFrontSlug(front.slug);
    return bySlug === null ? null : { card: bySlug, bySlug: true };
  }

  /** slug で見つかったカードの元の sourceId が今回の取得にも残っているなら、id の振り直しではないので拒否する。 */
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
    const incomingSourceIds = new Set(parsed.map((e) => frontEditionFace(e).sourceId));
    const matches = parsed.map((edition) => ({
      edition,
      match: matchEdition(edition, previous, incomingSourceIds),
    }));
    const matchedPrevious = matches.flatMap(({ match }) => (match === undefined ? [] : [match]));

    // セットを先に全部引いてから id を振る。並行に引きながら振ると、UUID v7 の時刻順が取得元の並び順とずれるため。
    const setIds = await Promise.all(matches.map(({ edition }) => this.#setIdOf(edition)));
    const kept = matches.map(({ edition, match }, i) =>
      this.#mergeEdition(edition, match, setIds[i]!, cardId),
    );
    const gone = previous
      .filter((p) => !matchedPrevious.includes(p))
      .map((edition) => withdrawEdition(edition, cardId, syncedAt));
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
      faces: edition.faces,
    };
    return { edition: merged, events: cardId === null ? [] : editionEvents(cardId, match, merged) };
  }
}

type EditionResult = { readonly edition: CardEdition; readonly events: readonly CardEvent[] };

type Found = { readonly card: Card; readonly bySlug: boolean };

/** 別のカードに当たるのは、インスタンスを使い回した application の誤りなので、拒否ではなく例外にする。 */
function matchCurrent(current: Card, front: CardFace): Found {
  const currentFront = frontFace(current);
  if (currentFront.sourceId === front.sourceId) return { card: current, bySlug: false };
  if (currentFront.slug !== front.slug) {
    throw new Error(
      `カード ${current.id} を扱うインスタンスに、別のカード（sourceId ${front.sourceId}）の同期が送られた`,
    );
  }
  return { card: current, bySlug: true };
}

/**
 * 表の面の sourceId で照合し、見つからなければ slug で照合する。
 * slug で見つかったエディションの元の sourceId が今回の取得にも残っているなら、id の振り直しではないので拒否する。
 */
function matchEdition(
  edition: ParsedEdition,
  previous: readonly CardEdition[],
  incomingSourceIds: ReadonlySet<SourceId>,
): CardEdition | undefined {
  const front = frontEditionFace(edition);
  const bySourceId = previous.find((p) => frontEditionFace(p).sourceId === front.sourceId);
  if (bySourceId !== undefined) return bySourceId;

  const bySlug = previous.find((p) => frontEditionFace(p).slug === front.slug);
  if (bySlug === undefined) return undefined;
  const previousSourceId = frontEditionFace(bySlug).sourceId;
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
        faces: merged.faces.map((f) => ({
          side: f.side,
          sourceId: f.sourceId,
          imageSourcePath: f.imageSourcePath,
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
function withdrawEdition(
  edition: CardEdition,
  cardId: CardId | null,
  syncedAt: Date,
): EditionResult {
  return {
    edition: { ...edition, isDefault: false, withdrawnAt: edition.withdrawnAt ?? syncedAt },
    events:
      edition.withdrawnAt === null && cardId !== null
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
    // #sync が面の組が変わらないことを確かめ、どちらも表・裏の順に並べてあるので、同じ位置の面どうしを比べる。
    ...before.faces.flatMap((face, i) => faceEvents(cardId, face, after.faces[i]!)),
    ...rulingEvents(cardId, before.rulings, after.rulings),
    ...referenceEvents(cardId, before.references, after.references),
    ...(changes.length === 0 ? [] : [{ type: "CardLegalityChanged" as const, cardId, changes }]),
  ];
}

/** 同じ側の面の前後を、ルールに関わる特性とそれ以外に分けて比べる。 */
function faceEvents(cardId: CardId, before: CardFace, after: CardFace): CardEvent[] {
  const side = after.side;
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

function sidesOf(card: { readonly faces: readonly CardFace[] }): FaceSide[] {
  return card.faces.map((f) => f.side);
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
  const keptBefore = before.filter((r) => after.some((a) => sameRuling(a, r)));
  const keptAfter = after.filter((r) => before.some((b) => sameRuling(b, r)));
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

/** CardLegalityChanged に載せる、1 フォーマット分の上限の変化。 */
export type LegalityChange = {
  readonly format: string;
  /** null は制限なし。 */
  readonly before: number | null;
  readonly after: number | null;
};

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

/** 種類と参照先の slug が同じなら同じ参照とみなす（DB の主キーと同じ組）。 */
function sameReference(x: CardReference, y: CardReference): boolean {
  return x.kind === y.kind && x.targetSlug === y.targetSlug;
}

type ParsedEdition = Omit<CardEdition, "id" | "setId" | "withdrawnAt"> & {
  readonly setSourceId: SourceId;
};

type Matched = {
  readonly parsed: ReturnType<typeof parseSnapshot>;
  readonly existing: Card | null;
};

/** RuleViolation を CardSyncRejected に変える。それ以外の例外は業務の結果ではないので、そのまま投げる。 */
function rejection(error: unknown, command: SyncCard, cardId: CardId | null): CardEvent[] {
  if (!(error instanceof RuleViolation)) throw error;
  return [
    {
      type: "CardSyncRejected",
      cardId,
      frontSourceId: command.snapshot.front.sourceId,
      reason: error.message,
    },
  ];
}

/**
 * 取得元のカード 1 枚分を value object とエンティティに変え、カードとエディションをまたぐ規則を確かめる。
 * 規則に合わなければ RuleViolation を投げる（#syncOrReject が CardSyncRejected に変える）。
 */
function parseSnapshot(snapshot: CardSnapshot) {
  const faces = [
    parseCardFace(snapshot.front, FaceSide("front")),
    ...(snapshot.back === null ? [] : [parseCardFace(snapshot.back, FaceSide("back"))]),
  ];

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
    faces,
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
    faces: [
      parseCardEditionFace(edition.front, FaceSide("front")),
      ...(edition.back === null ? [] : [parseCardEditionFace(edition.back, FaceSide("back"))]),
    ],
  };
}

/**
 * 順序に意味のない配列を決まった順に並べる。「変更なし」の判定を、repository が返す並び順や
 * 取得元の並び順に左右させないため。裁定は並び順に意味がある（DB は position で持つ）ので並べ替えない。
 * 参照は (kind, targetSlug) が主キーなので、重複を除く。
 */
function normalize(state: Card): Card {
  // kind と slug の区切りに、どちらにも現れない \u0000 を使う。"A-B" + "C" と "A" + "B-C" を同じ鍵にしないため。
  const references = new Map(state.references.map((r) => [`${r.kind}\u0000${r.targetSlug}`, r]));
  return {
    ...state,
    faces: sortBySide([...state.faces]),
    references: [...references.entries()].toSorted(([a], [b]) => compare(a, b)).map(([, r]) => r),
    editions: state.editions
      .map((e) => ({ ...e, faces: sortBySide([...e.faces]) }))
      .toSorted((a, b) => compare(frontEditionFace(a).sourceId, frontEditionFace(b).sourceId)),
  };
}

function sortBySide<T extends { readonly side: FaceSide }>(faces: T[]): T[] {
  return faces.toSorted((a, b) => (a.side === b.side ? 0 : a.side === "front" ? -1 : 1));
}

/**
 * 文字コードの順で比べる。localeCompare は実行環境のロケールで順が変わり、
 * 環境が変わると同じデータでも「並びが変わった」と判定してしまうので使わない。
 */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
