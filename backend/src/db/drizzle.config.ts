import { defineConfig } from "drizzle-kit";

// DATABASE_URL は .devcontainer/compose.yaml が app コンテナに渡す。
// generate と check は DB に接続しないので、DATABASE_URL が無い環境（CI など）でも動くようにする。
const url = process.env.DATABASE_URL;

// このファイルを backend の直下に置くと tsconfig.json の rootDir（./src）の外になり、型検査から外れる。
// schema と out のパスは、このファイルの場所ではなく drizzle-kit を実行する backend からの相対で書く。
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  ...(url ? { dbCredentials: { url } } : {}),
});
