// Grand Archive のカードデータベース。取得元は https://api.gatcg.com 。
//
// 主キーは DB が振り、API の id は source_id に分ける。API が id を振り直しても、カードを参照する
// 利用者のデータ（デッキなど）が壊れないようにするため。API の行とこちらの行も 1 対 1 ではない。
// source_id は大文字小文字だけが違う値が実在するので、小文字にそろえない。
//
// 列の値の規則（カード種別ごとにどの数値を持つかなど）は CHECK 制約にせず、取り込みで確かめる。
// 書き込むのは取り込みだけで、規則を SQL と TypeScript の 2 か所に書くとずれるため。
//
// 両面カードはルールのとおり「2 つの面を持つ 1 枚のカード」として持ち、特性と画像を面のテーブルに置く。
// 場の外ではカードの特性は表の面だけで決まるので、カードを読むときは cardFronts を通す。

import { eq, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  pgView,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`);

const faceSide = (name: string) => text(name, { enum: ["front", "back"] });

/** カードを収録した商品（ブースター、スターターデッキ、プロモなど）。 */
export const cardSets = pgTable("card_sets", {
  id: id(),
  sourceId: text("source_id").notNull().unique(),
  prefix: text("prefix").notNull().unique(),
  name: text("name").notNull(),
  language: text("language").notNull(),
  // NULL は発売日が未定。
  releaseDate: date("release_date"),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
});

/**
 * ルール上の 1 枚のカード。名前や効果は cardFaces が持つ。
 * デッキに入れる単位で、デッキのテーブルは面ではなくここを参照する。
 */
export const cards = pgTable("cards", {
  id: id(),
  legality: jsonb("legality").$type<Record<string, { limit: number }>>(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

/** カードの面。名前・種別・コスト・効果を持つ。片面のカードは表の面だけを持つ。 */
export const cardFaces = pgTable(
  "card_faces",
  {
    id: id(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    side: faceSide("side").notNull(),
    sourceId: text("source_id").notNull().unique(),
    slug: text("slug").notNull().unique(),
    // 一意ではない。同じ名前のカードが複数ある。
    name: text("name").notNull(),

    // 先頭が代表の属性。
    elements: text("elements").array().notNull(),
    classes: text("classes").array().notNull(),
    types: text("types").array().notNull(),
    subtypes: text("subtypes").array().notNull(),

    costType: text("cost_type", { enum: ["memory", "reserve", "none"] }).notNull(),
    costValue: smallint("cost_value"),
    // API は X コストを -1 で返す。並べ替えに -1 が混ざらないよう、costValue を NULL にして分ける。
    costIsX: boolean("cost_is_x").notNull().default(false),

    level: smallint("level"),
    life: smallint("life"),
    power: smallint("power"),
    durability: smallint("durability"),
    speed: text("speed", { enum: ["slow", "fast"] }),

    // API 独自の記法つきの効果文。
    effect: text("effect"),
    // effect から記法を外した検索用の文。
    effectRaw: text("effect_raw"),

    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("card_faces_card_id_side_idx").on(t.cardId, t.side)],
);

/**
 * カードの表の面。カードの特性はここから読む。
 * cardFaces を面で絞らずに読むと、両面カードだけが 2 行になる。
 */
export const cardFronts = pgView("card_fronts").as((qb) =>
  qb.select().from(cardFaces).where(eq(cardFaces.side, "front")),
);

/** カードごとの公式の裁定と ERRATA。 */
export const cardRulings = pgTable(
  "card_rulings",
  {
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    // API は裁定に id を付けないので、カード内の並び順で識別する。
    position: smallint("position").notNull(),
    title: text("title"),
    addedOn: date("added_on").notNull(),
    description: text("description").notNull(),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.position] })],
);

/** あるカードが生成・参照する別のカード（召喚するトークンなど）。 */
export const cardReferences = pgTable(
  "card_references",
  {
    fromCardId: uuid("from_card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    toCardId: uuid("to_card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.fromCardId, t.toCardId, t.kind] }),
    index("card_references_to_card_id_idx").on(t.toCardId),
  ],
);

/**
 * カードの印刷 1 種類。同じカードでもセットや絵柄が違えば別の行になる。
 * 画像やフレーバーは cardEditionFaces が持つ。
 * (setId, collectorNumber) は一意ではない。同じ番号の絵違いがある。
 */
export const cardEditions = pgTable(
  "card_editions",
  {
    id: id(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    setId: uuid("set_id")
      .notNull()
      .references(() => cardSets.id),
    // "001A" のような番号があるので文字列で持つ。
    collectorNumber: text("collector_number").notNull(),
    // 1=C 2=U 3=R 4=SR 5=UR 6=PR 7=CSR 8=CUR 9=CPR
    rarity: smallint("rarity").notNull(),
    isDefault: boolean("is_default").notNull(),
  },
  (t) => [
    index("card_editions_card_id_idx").on(t.cardId),
    index("card_editions_set_id_idx").on(t.setId),
    uniqueIndex("card_editions_default_idx")
      .on(t.cardId)
      .where(sql`${t.isDefault}`),
  ],
);

/**
 * 印刷の面。画像・イラストレーター・フレーバーを持つ。
 * 面の組はカードの面の組とそろえる（取り込みで確かめる）。
 * 効果文は持たない。API がエディションに返す効果文は印刷時点の古い文面で、ルールに使うのはカードの面の文面だから。
 */
export const cardEditionFaces = pgTable(
  "card_edition_faces",
  {
    id: id(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => cardEditions.id, { onDelete: "cascade" }),
    side: faceSide("side").notNull(),
    sourceId: text("source_id").notNull().unique(),
    slug: text("slug").notNull().unique(),
    illustrator: text("illustrator"),
    collaborators: text("collaborators").array().notNull().default([]),
    // エディションの値だけを持つ。API はカードにもフレーバーを返すが、それで補うと画像の文と食い違う。
    flavor: text("flavor"),
    imageSourcePath: text("image_source_path").notNull(),
    // NULL はまだ取得していない。
    imageId: uuid("image_id").references(() => images.id, { onDelete: "set null" }),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("card_edition_faces_edition_id_side_idx").on(t.editionId, t.side),
    index("card_edition_faces_image_id_idx").on(t.imageId),
  ],
);

/**
 * 自前のストレージに保存した画像ファイル。何の画像かは持たず、使う側のテーブルが image_id で参照する。
 * 参照する側を消しても画像は残るので、どこからも参照されない画像はアプリケーションが消す。
 */
export const images = pgTable("images", {
  id: id(),
  storageKey: text("storage_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  byteSize: integer("byte_size").notNull(),
  sourceUrl: text("source_url"),
  // 参照する側ではなくここに置く。参照する側に置くと、画像を消しても ETag が残り、
  // API が 304 を返し続けて取り直せなくなる。
  sourceEtag: text("source_etag"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
