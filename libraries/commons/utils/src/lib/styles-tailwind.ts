import { twMerge } from "tailwind-merge";
import clsx, { type ClassValue } from "clsx";

export const cn = (...classes: ClassValue[]) => twMerge(clsx(...classes));
