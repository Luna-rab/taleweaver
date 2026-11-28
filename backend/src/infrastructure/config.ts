import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  GATCG_BASE_URL: z.url().default("https://api.gatcg.com"),
  // 本番では渡さず、AWS の S3 につなぐ。
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1),
  // "false" を true にしないよう、coerce ではなく stringbool で読む。
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
  IMAGES_BUCKET: z.string().min(1),
});

// 鍵は両方渡すか、両方省いて AWS SDK の既定の認証情報（ECS のタスクロールなど）を使う。
const credentialsSchema = z.union([
  z
    .object({ S3_ACCESS_KEY_ID: z.string().min(1), S3_SECRET_ACCESS_KEY: z.string().min(1) })
    .transform((e) => ({
      accessKeyId: e.S3_ACCESS_KEY_ID,
      secretAccessKey: e.S3_SECRET_ACCESS_KEY,
    })),
  z
    .object({
      S3_ACCESS_KEY_ID: z.undefined().optional(),
      S3_SECRET_ACCESS_KEY: z.undefined().optional(),
    })
    .transform(() => null),
]);

export type Config = z.infer<typeof schema> & {
  readonly s3Credentials: z.infer<typeof credentialsSchema>;
};

/** 環境変数を読む。足りなければ、どの変数かを載せて例外を投げる。 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return { ...schema.parse(env), s3Credentials: credentialsSchema.parse(env) };
}
