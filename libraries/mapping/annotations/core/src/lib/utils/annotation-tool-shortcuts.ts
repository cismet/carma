import {
  ANNOTATION_TYPES,
  ANNOTATION_TOOL_TYPES,
  type AnnotationToolType,
} from "../types/annotation-types";

const TOOL_LETTER_SHORTCUTS = {
  [ANNOTATION_TOOL_TYPES.SELECT]: "S",
  [ANNOTATION_TYPES.POINT]: "M",
  [ANNOTATION_TYPES.DISTANCE]: "D",
  [ANNOTATION_TYPES.POLYLINE]: "P",
  [ANNOTATION_TYPES.AREA_GROUND]: "A",
  [ANNOTATION_TYPES.AREA_PLANAR]: "C",
  [ANNOTATION_TYPES.AREA_VERTICAL]: "V",
  [ANNOTATION_TYPES.LABEL]: "B",
} as const satisfies Partial<Record<AnnotationToolType, string>>;

export const getAnnotationToolLetterShortcut = (
  toolType: AnnotationToolType
): string | null =>
  TOOL_LETTER_SHORTCUTS[toolType] ?? null;

export const getAnnotationToolPositionShortcut = (
  toolType: AnnotationToolType,
  orderedToolTypes: readonly AnnotationToolType[]
): string | null => {
  if (!orderedToolTypes.includes(toolType)) {
    return null;
  }

  if (toolType === ANNOTATION_TOOL_TYPES.SELECT) {
    return "0";
  }

  const nonSelectionToolTypes = orderedToolTypes.filter(
    (candidateToolType) => candidateToolType !== ANNOTATION_TOOL_TYPES.SELECT
  );
  const index = nonSelectionToolTypes.indexOf(toolType);
  if (index < 0) {
    return null;
  }

  const positionShortcut = index + 1;
  return positionShortcut <= 9 ? String(positionShortcut) : null;
};

export const listAnnotationToolShortcuts = (
  toolType: AnnotationToolType,
  orderedToolTypes: readonly AnnotationToolType[]
): string[] => {
  const shortcuts = [
    getAnnotationToolLetterShortcut(toolType),
    getAnnotationToolPositionShortcut(toolType, orderedToolTypes),
  ].filter((shortcut): shortcut is string => Boolean(shortcut));

  return [...new Set(shortcuts)];
};

export const resolveAnnotationToolShortcutTarget = (
  key: string,
  orderedToolTypes: readonly AnnotationToolType[]
): AnnotationToolType | null => {
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
