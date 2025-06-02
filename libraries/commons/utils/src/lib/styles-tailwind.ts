import { twMerge } from "tailwind-merge";
import clsx, { type ClassValue } from "clsx";

export const cn = (...classes: ClassValue[]) => twMerge(clsx(...classes));

export const TAILWIND_CLASSNAMES_FULLSCREEN_FIXED =
  "fixed flex flex-col w-full h-full";
