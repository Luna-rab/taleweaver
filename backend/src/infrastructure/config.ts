import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
});

export type Config = z.infer<typeof schema>;

/** 環境変数を読む。足りなければ、どの変数かを載せて例外を投げる。 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env);
}
