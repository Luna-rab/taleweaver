# syntax=docker/dockerfile:1
# 開発コンテナ（app）のイメージ。Playwright MCP が使う Chromium をイメージに入れておき、
# コンテナを作るたびに post_create.sh で入れ直さずに済むようにする。
# ビルドの起点はリポジトリの直下で、Dockerfile.dockerignore が package-lock.json 以外を除外する。

# Chromium は lockfile にある playwright の版で入れる。版がずれると、MCP が要求する Chromium のビルドが見つからず起動できない。
# 版だけを別の段で取り出すのは、次の段のキャッシュを playwright の版が変わったときだけ捨てさせるため。
# lockfile をそのまま渡すと、ほかの依存を変えただけで Chromium を入れ直すことになる。
FROM node:24-slim AS playwright-version
COPY package-lock.json /tmp/package-lock.json
RUN node -p "require('/tmp/package-lock.json').packages['node_modules/playwright'].version" > /playwright-version

FROM mcr.microsoft.com/devcontainers/base:ubuntu

# 既定の置き場所（~/.cache/ms-playwright）はユーザーごとに分かれ、ビルドする root のホームに入ってしまう。
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# node は devcontainer の feature がイメージのあとで入れるので、ここではまだ無い。
# node のイメージをビルドの間だけ借り、イメージの層には残さない。
# --with-deps は Chromium の実行に要るシステムライブラリと日本語フォントも apt で入れる。
RUN --mount=type=bind,from=playwright-version,source=/playwright-version,target=/tmp/playwright-version \
    --mount=type=bind,from=node:24-slim,source=/usr/local,target=/opt/node \
    export PATH="/opt/node/bin:$PATH" \
    && npx --yes "playwright@$(cat /tmp/playwright-version)" install --with-deps chromium \
    && chmod -R a+rX "$PLAYWRIGHT_BROWSERS_PATH" \
    && rm -rf /root/.npm /var/lib/apt/lists/*
