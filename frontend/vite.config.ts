/// <reference types="vitest/config" />
import path from "path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 第 3 引数を "" にすると、VITE_ で始まらない値も読める。ここで読んだ値はブラウザには渡らない。
  const env = loadEnv(mode, import.meta.dirname, "");

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
    server: {
      // このコンテナでは localhost が ::1(IPv6)だけに解決され、VS Code のポート転送は 127.0.0.1 につなぐので、既定の localhost では届かない
      host: "127.0.0.1",
      // 本番では配信側（CDN やリバースプロキシ）が /images/* を画像のバケットに振り分ける。
      // 開発でも同じパスをストレージに中継し、frontend が環境ごとに画像の URL を変えずに済むようにする。
      proxy:
        env.S3_ENDPOINT && env.IMAGES_BUCKET
          ? {
              "/images": {
                target: env.S3_ENDPOINT,
                changeOrigin: true,
                rewrite: (requestPath) => requestPath.replace(/^\/images/, `/${env.IMAGES_BUCKET}`),
              },
            }
          : undefined,
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
    },
  };
});
