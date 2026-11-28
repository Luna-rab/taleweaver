import { Collaborator } from "../../../value-objects/collaborator.js";
import type { FaceSide } from "../../../value-objects/face-side.js";
import { FlavorText } from "../../../value-objects/flavor-text.js";
import { Illustrator } from "../../../value-objects/illustrator.js";
import type { ImageId } from "../../../value-objects/image-id.js";
import { ImageSourcePath } from "../../../value-objects/image-source-path.js";
import { Slug } from "../../../value-objects/slug.js";
import { SourceId } from "../../../value-objects/source-id.js";
import type { CardEditionFaceSnapshot } from "../commands.js";

/**
 * エディションの面。エディションの中では side（表か裏か）で区別する。
 * 画像はこの面に結び付けるので、絵やフレーバーが変わっても同じ面として追う。
 * 面の組はカードの面の組とそろう。
 */
export type CardEditionFace = {
  readonly side: FaceSide;
  readonly sourceId: SourceId;
  readonly slug: Slug;
  readonly illustrator: Illustrator | null;
  readonly collaborators: readonly Collaborator[];
  readonly flavor: FlavorText | null;
  readonly imageSourcePath: ImageSourcePath;
  /** 取得して保存した画像。null はまだ取得していない。取得元のスナップショットには無く、AttachEditionImage で結び付ける。 */
  readonly imageId: ImageId | null;
  readonly sourceUpdatedAt: Date;
};

/** 取得元のスナップショットから読める分。imageId は既存のエディションの面から引き継ぐ。 */
export type ParsedCardEditionFace = Omit<CardEditionFace, "imageId">;

/** 業務の規則に合わない値があれば RuleViolation を投げる。 */
export function parseCardEditionFace(
  face: CardEditionFaceSnapshot,
  side: FaceSide,
): ParsedCardEditionFace {
  return {
    side,
    sourceId: SourceId(face.sourceId),
    slug: Slug(face.slug),
    illustrator: face.illustrator === null ? null : Illustrator(face.illustrator),
    collaborators: face.collaborators.map((c) => Collaborator(c)),
    flavor: face.flavor === null ? null : FlavorText(face.flavor),
    imageSourcePath: ImageSourcePath(face.imageSourcePath),
    sourceUpdatedAt: face.sourceUpdatedAt,
  };
}
