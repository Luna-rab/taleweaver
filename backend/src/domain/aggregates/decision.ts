import { RuleViolation } from "../value-objects/utils/rule-violation.js";

/**
 * 集約がコマンドを処理した結果。
 *
 * - accepted: コマンドを受け付けた。events は状態を変えたイベントだけで、空なら状態は変わっていない。
 *   application は events が空でなければ state を repository.save に渡す。
 * - rejected: 業務の規則に合わないので断った。状態は前のまま。reason は破った規則を表す。
 */
export type Decision<E> =
  | { readonly kind: "accepted"; readonly events: readonly E[] }
  | { readonly kind: "rejected"; readonly reason: string };

export function accepted<E>(events: readonly E[]): Decision<E> {
  return { kind: "accepted", events };
}

export function rejected<E>(reason: string): Decision<E> {
  return { kind: "rejected", reason };
}

/**
 * run が返したイベントで accepted を返し、RuleViolation を投げたら rejected に変える。
 * それ以外の例外は業務の結果ではないので、そのまま投げる。
 */
export async function decide<E>(
  run: () => readonly E[] | Promise<readonly E[]>,
): Promise<Decision<E>> {
  try {
    return accepted(await run());
  } catch (error) {
    if (!(error instanceof RuleViolation)) throw error;
    return rejected(error.message);
  }
}
