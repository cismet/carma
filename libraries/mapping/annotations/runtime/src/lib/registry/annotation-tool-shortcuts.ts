import type { AnnotationToolId } from "./annotation-tool-id";
import type { AnnotationToolDescriptor } from "./annotation-tool-plugin.types";

const getToolDescriptor = (
  toolId: AnnotationToolId,
  orderedDescriptors: readonly AnnotationToolDescriptor[]
) => orderedDescriptors.find((descriptor) => descriptor.id === toolId) ?? null;

export const getAnnotationToolLetterShortcut = (
  toolId: AnnotationToolId,
  orderedDescriptors: readonly AnnotationToolDescriptor[]
): string | null =>
  getToolDescriptor(toolId, orderedDescriptors)?.shortcutKey ?? null;

export const getAnnotationToolPositionShortcut = (
  toolId: AnnotationToolId,
  orderedDescriptors: readonly AnnotationToolDescriptor[],
  primaryInteractionToolId: AnnotationToolId | null
): string | null => {
  if (!getToolDescriptor(toolId, orderedDescriptors)) {
    return null;
  }

  if (primaryInteractionToolId && toolId === primaryInteractionToolId) {
    return "0";
  }

  const nonInteractionToolDescriptors = orderedDescriptors.filter(
    (descriptor) => descriptor.id !== primaryInteractionToolId
  );
  const index = nonInteractionToolDescriptors.findIndex(
    (descriptor) => descriptor.id === toolId
  );
  if (index < 0) {
    return null;
  }

  const positionShortcut = index + 1;
  return positionShortcut <= 9 ? String(positionShortcut) : null;
};

export const listAnnotationToolShortcuts = (
  toolId: AnnotationToolId,
  orderedDescriptors: readonly AnnotationToolDescriptor[],
  primaryInteractionToolId: AnnotationToolId | null
): string[] => {
  const shortcuts = [
    getAnnotationToolLetterShortcut(toolId, orderedDescriptors),
    getAnnotationToolPositionShortcut(
      toolId,
      orderedDescriptors,
      primaryInteractionToolId
    ),
  ].filter((shortcut): shortcut is string => Boolean(shortcut));

  return [...new Set(shortcuts)];
};

export const resolveAnnotationToolShortcutTarget = (
  key: string,
  orderedDescriptors: readonly AnnotationToolDescriptor[],
  primaryInteractionToolId: AnnotationToolId | null
): AnnotationToolId | null => {
  const normalizedKey = key.trim().toLowerCase();
  if (!normalizedKey) {
    return null;
  }

  const orderedToolIds = orderedDescriptors.map((descriptor) => descriptor.id);
  const letterMatch = orderedToolIds.find(
    (toolId) =>
      getAnnotationToolLetterShortcut(toolId, orderedDescriptors)?.toLowerCase() ===
      normalizedKey
  );
  if (letterMatch) {
    return letterMatch;
  }

  const positionMatch = orderedToolIds.find(
    (toolId) =>
      getAnnotationToolPositionShortcut(
        toolId,
        orderedDescriptors,
        primaryInteractionToolId
      ) === normalizedKey
  );

  return positionMatch ?? null;
};
