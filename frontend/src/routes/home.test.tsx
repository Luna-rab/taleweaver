import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { expect, test } from "vitest";

import { routes } from "@/router";

test("/ を開くと、ヘッダーとフッターの間に見出しとボタンが表示される", () => {
  const router = createMemoryRouter(routes, { initialEntries: ["/"] });

  render(<RouterProvider router={router} />);

  expect(screen.getByRole("banner")).toBeInTheDocument();
  expect(screen.getByRole("contentinfo")).toBeInTheDocument();

  const main = within(screen.getByRole("main"));
  expect(main.getByRole("heading", { name: "Taleweaver" })).toBeInTheDocument();
  expect(main.getByRole("button", { name: "はじめる" })).toBeInTheDocument();
});
