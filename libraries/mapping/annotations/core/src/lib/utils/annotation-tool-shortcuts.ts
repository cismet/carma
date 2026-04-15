import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  SELECT_TOOL_TYPE,
  type AnnotationToolType,
} from "../types/annotation-types";

const TOOL_LETTER_SHORTCUTS = {
  [SELECT_TOOL_TYPE]: "S",
  [ANNOTATION_TYPE_POINT]: "M",
  [ANNOTATION_TYPE_DISTANCE]: "D",
  [ANNOTATION_TYPE_POLYLINE]: "P",
  [ANNOTATION_TYPE_AREA_GROUND]: "A",
  [ANNOTATION_TYPE_AREA_PLANAR]: "C",
  [ANNOTATION_TYPE_AREA_VERTICAL]: "V",
  [ANNOTATION_TYPE_LABEL]: "B",
} as const satisfies Partial<Record<AnnotationToolType, string>>;

export const getAnnotationToolLetterShortcut = (
  toolType: string
): string | null =>
  TOOL_LETTER_SHORTCUTS[toolType as AnnotationToolType] ?? null;

export const getAnnotationToolPositionShortcut = (
  toolType: string,
  orderedToolTypes: readonly string[]
): string | null => {
  if (!orderedToolTypes.includes(toolType)) {
    return null;
  }

  if (toolType === SELECT_TOOL_TYPE) {
    return "0";
  }

  const nonSelectionToolTypes = orderedToolTypes.filter(
    (candidateToolType) => candidateToolType !== SELECT_TOOL_TYPE
  );
  const index = nonSelectionToolTypes.indexOf(toolType);
  if (index < 0) {
    return null;
  }

  const positionShortcut = index + 1;
  return positionShortcut <= 9 ? String(positionShortcut) : null;
};

export const listAnnotationToolShortcuts = (
  toolType: string,
  orderedToolTypes: readonly string[]
): string[] => {
  const shortcuts = [
    getAnnotationToolLetterShortcut(toolType),
    getAnnotationToolPositionShortcut(toolType, orderedToolTypes),
  ].filter((shortcut): shortcut is string => Boolean(shortcut));

  return [...new Set(shortcuts)];
};

export const resolveAnnotationToolShortcutTarget = (
  key: string,
  orderedToolTypes: readonly string[]
): string | null => {
  const normalizedKey = key.trim().toLowerCase();
  if (!normalizedKey) {
    return null;
  }

  const letterMatch = orderedToolTypes.find(
    (toolType) =>
      getAnnotationToolLetterShortcut(toolType)?.toLowerCase() === normalizedKey
  );
  if (letterMatch) {
    return letterMatch;
  }

  const positionMatch = orderedToolTypes.find(
    (toolType) =>
      getAnnotationToolPositionShortcut(toolType, orderedToolTypes) ===
      normalizedKey
  );

  return positionMatch ?? null;
};
