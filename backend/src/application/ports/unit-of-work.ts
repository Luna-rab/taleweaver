import type { CardRepository } from "../../domain/ports/card-repository.js";
import type { CardSetRepository } from "../../domain/ports/card-set-repository.js";
import type { ImageRepository } from "../../domain/ports/image-repository.js";

/**
 * 1 つの DB トランザクション。callback が解決すればコミットし、例外を投げればロールバックして同じ例外を投げる。
 * 集約の状態とイベントを同じトランザクションで書き、状態だけが変わってイベントが失われないようにする。
 */
export interface UnitOfWork {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
}

/** トランザクションに結び付いた repository と、イベントの書き込み先。 */
export type Transaction = {
  readonly cards: CardRepository;
  readonly cardSets: CardSetRepository;
  readonly images: ImageRepository;
  readonly events: EventStore;
};

export type AggregateRef = {
  readonly type: "card" | "card_set" | "image";
  readonly id: string;
};

export interface EventStore {
  /** 集約が出したイベントを書き、購読する処理の仕事を application/policies/subscriptions.ts のとおりに積む。 */
  append(
    aggregate: AggregateRef,
    events: readonly { readonly type: string }[],
    occurredAt: Date,
  ): Promise<void>;
  /**
   * 書いたイベントを、集約が出したときの形で読む。日時は ISO 8601 の文字列になっているので、
   * 日時を持つイベントを読むときは直してから使う。
   */
  findById(id: string): Promise<{ readonly type: string } | null>;
}
