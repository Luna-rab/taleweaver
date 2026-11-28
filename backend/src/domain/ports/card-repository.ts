import type { Card } from "../aggregates/card/entities/card.js";
import type { CardId } from "../value-objects/card-id.js";
import type { Slug } from "../value-objects/slug.js";
import type { SourceId } from "../value-objects/source-id.js";

export interface CardRepository {
  findById(id: CardId): Promise<Card | null>;
  findByFrontSourceId(sourceId: SourceId): Promise<Card | null>;
  findByFrontSlug(slug: Slug): Promise<Card | null>;
  /** 取り下げの判定に使う。取り下げたカードも含む。 */
  listSourceKeys(): Promise<readonly StoredCardKey[]>;
  /**
   * カードを upsert する。面とエディションの面は (親の id, side)、エディションは id を鍵に書き換え、
   * card にない裁定・参照・面の行は消す。エディションは取り下げても card に残るので消えない。
   * エディションの面の image_id は Image 側が書くので、更新する列に含めない。
   */
  save(card: Card): Promise<void>;
}

export type StoredCardKey = {
  readonly id: CardId;
  readonly frontSourceId: SourceId;
  readonly frontSlug: Slug;
  readonly withdrawn: boolean;
};
