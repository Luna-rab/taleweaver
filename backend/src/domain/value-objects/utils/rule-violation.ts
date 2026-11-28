/**
 * 取得元のデータが業務の規則に合わないことを表す。
 * value object の検証はこれだけを投げ、集約はこれだけを「拒否」の結果に変える。
 * それ以外の例外（DB の障害、手順の誤り）は集約の外へそのまま投げる。
 */
export class RuleViolation extends Error {
  override name = "RuleViolation";
}

export function ensure(condition: boolean, message: string): asserts condition {
  if (!condition) throw new RuleViolation(message);
}
