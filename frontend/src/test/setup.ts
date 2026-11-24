import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest の globals を有効にしていないので、Testing Library は描画した DOM を自動では片付けない
afterEach(() => {
  cleanup();
});
