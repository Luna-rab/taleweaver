import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../../db/schema.js";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/** トランザクションの中で repository が使う。 */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** DATABASE_URL の DB につなぐ。使い終えたら close を呼び、接続を閉じる。 */
export function connect(url: string): { db: Database; close: () => Promise<void> } {
  const pool = new Pool({ connectionString: url });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}
