declare const brandSymbol: unique symbol;

/**
 * Branded Type を定義するユーティリティ型。Base型にName文字列リテラルのブランドを付与する。
 * brandSymbol プロパティにName（型の区別）とBase（ベース型の保持）を格納し、
 * createBrand<B> でベース型を推論できるようにしている。
 */
export type Brand<Base, Name extends string> = Base & {
  readonly [brandSymbol]: { name: Name; base: Base };
};

/** Branded Type からベース型を抽出する */
type BaseOf<B> = B extends { readonly [brandSymbol]: { base: infer Base } } ? Base : never;

/**
 * Branded Type のバリデーション付きファクトリ関数を作成する
 *
 * @param validate - オプションのバリデーション関数。不正な値の場合は例外をスローすること
 * @returns バリデーション済みのBranded値を返すファクトリ関数
 */
export function createBrand<B extends { readonly [brandSymbol]: { base: unknown } }>(
  validate?: (value: BaseOf<B>) => void,
): (value: BaseOf<B>) => B {
  return (value: BaseOf<B>): B => {
    validate?.(value);
    return value as B;
  };
}
