import type { carma } from "./index";

declare global {
  interface Window {
    carma?: typeof carma;
  }
}

export {};
