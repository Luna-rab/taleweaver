import { type Brand, createBrand } from "./utils/brand.js";

export type Collaborator = Brand<string, "Collaborator">;

export const Collaborator = createBrand<Collaborator>();
