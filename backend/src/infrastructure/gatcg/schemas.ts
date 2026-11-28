import { z } from "zod";

// 取得元の応答の形だけを確かめる。値の規則（属性の一覧、コストが 0 以上か など）は domain が確かめる。
// 使う項目だけを書き、ほかの項目は無視する。

/** 取得元は last_update を Z 付きと +00:00 付きの両方で返す。 */
const timestamp = z.iso.datetime({ offset: true });

const cost = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  // value は数字の文字列か "X"。
  z.object({ type: z.enum(["memory", "reserve"]), value: z.string() }),
]);

const faceFields = {
  uuid: z.string(),
  slug: z.string(),
  name: z.string(),
  elements: z.array(z.string()),
  classes: z.array(z.string()),
  types: z.array(z.string()),
  subtypes: z.array(z.string()),
  cost,
  level: z.number().nullable(),
  life: z.number().nullable(),
  power: z.number().nullable(),
  durability: z.number().nullable(),
  speed: z.boolean().nullable(),
  effect: z.string().nullable(),
  effect_raw: z.string().nullable(),
  last_update: timestamp,
};

const editionFaceFields = {
  uuid: z.string(),
  slug: z.string(),
  illustrator: z.string().nullable(),
  collaborators: z.array(z.string()),
  flavor: z.string().nullable(),
  image: z.string(),
  last_update: timestamp,
};

export const setSchema = z.object({
  id: z.string(),
  prefix: z.string(),
  name: z.string(),
  language: z.string(),
  // 時刻つきで、時差を付けずに返る（2024-01-24T00:00:00）。
  release_date: z.iso.datetime({ local: true }).nullable(),
  last_update: timestamp,
});

/** 両面カードの裏面。カードの面の項目に、その裏面を印刷したエディションの面が付く。 */
const otherOrientation = z.object({
  ...faceFields,
  edition: z.object(editionFaceFields),
});

const edition = z.object({
  ...editionFaceFields,
  collector_number: z.string(),
  rarity: z.number(),
  is_default: z.boolean(),
  set: setSchema,
  other_orientations: z.array(otherOrientation),
});

export const cardSchema = z.object({
  ...faceFields,
  // 制限のないカードは null で返る。
  legality: z.record(z.string(), z.object({ limit: z.number() })).nullable(),
  rule: z.array(z.object({ title: z.string(), date_added: z.string(), description: z.string() })),
  references: z.array(z.object({ kind: z.string(), slug: z.string() })),
  editions: z.array(edition),
});

export type GatcgCard = z.infer<typeof cardSchema>;
export type GatcgFace = z.infer<typeof otherOrientation> | GatcgCard;
export type GatcgEditionFace = z.infer<typeof otherOrientation>["edition"];
export type GatcgSet = z.infer<typeof setSchema>;

/** 形が合わないカードも、取得に含まれたことは記録するので、まず id と slug だけを読む。 */
export const cardKeySchema = z.object({ uuid: z.string(), slug: z.string() });

export const pageSchema = z.object({
  data: z.array(z.unknown()),
  total_cards: z.number(),
  has_more: z.boolean(),
});
