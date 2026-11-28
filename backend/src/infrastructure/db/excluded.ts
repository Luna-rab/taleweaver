import { getTableColumns, type SQL, sql, type Table } from "drizzle-orm";

/**
 * upsert（ON CONFLICT DO UPDATE）の set に渡す、row のキーを全部 excluded の値で書き換える指定。
 * 複数行をまとめて upsert するとき、行ごとに追加しようとした値で書き換えるのに使う。
 */
export function excluded<T extends Table>(table: T, row: object): Record<string, SQL> {
  const columns: Record<string, { name: string }> = getTableColumns(table);
  return Object.fromEntries(
    Object.keys(row).map((key) => [key, sql.raw(`excluded."${columns[key]!.name}"`)]),
  );
}
