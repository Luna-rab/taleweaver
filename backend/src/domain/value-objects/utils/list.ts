/** v が list のどれかと一致するか。一致すれば v を list の要素の型に絞る。 */
export function isListed<const L extends readonly string[]>(list: L, v: string): v is L[number] {
  return list.includes(v);
}
