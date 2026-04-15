import type { AnnotationToolPlugin } from "./annotation-tool-plugin.types";

export const createAnnotationToolPlugin = <
  TPlugin extends AnnotationToolPlugin
>(
  plugin: TPlugin
): TPlugin => plugin;
