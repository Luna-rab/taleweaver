import { type Brand, createBrand } from "./utils/brand.js";

export type Illustrator = Brand<string, "Illustrator">;

export const Illustrator = createBrand<Illustrator>();
