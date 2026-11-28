import type { CalendarDate } from "../../../value-objects/calendar-date.js";
import type { CardSetId } from "../../../value-objects/card-set-id.js";
import type { CardSetLanguage } from "../../../value-objects/card-set-language.js";
import type { CardSetName } from "../../../value-objects/card-set-name.js";
import type { CardSetPrefix } from "../../../value-objects/card-set-prefix.js";
import type { SourceId } from "../../../value-objects/source-id.js";

/**
 * カードを収録した商品（ブースター、スターターデッキ、プロモなど）。id で区別する。
 * エディションが id で参照するので、取得元から見えなくなっても行を残す。
 */
export type CardSet = {
  readonly id: CardSetId;
  /** 楽観ロックの版番号。集約は書き換えず、repository の save が読んだときの版と比べて 1 上げる。 */
  readonly version: number;
  readonly sourceId: SourceId;
  readonly prefix: CardSetPrefix;
  readonly name: CardSetName;
  readonly language: CardSetLanguage;
  /** null は発売日が未定。 */
  readonly releaseDate: CalendarDate | null;
  readonly sourceUpdatedAt: Date;
};
