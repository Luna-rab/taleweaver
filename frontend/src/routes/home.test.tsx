import { render, screen } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { expect, test } from "vitest";
import { routes } from "@/router";

test("/ を開くと見出しとボタンが表示される", () => {
  const router = createMemoryRouter(routes, { initialEntries: ["/"] });

  render(<RouterProvider router={router} />);

  expect(screen.getByRole("heading", { name: "Taleweaver" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "はじめる" })).toBeInTheDocument();
});
