import type { RouteObject } from "react-router";
import { Layout } from "@/components/layout";
import { Home } from "@/routes/home";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Home />,
      },
    ],
  },
];
