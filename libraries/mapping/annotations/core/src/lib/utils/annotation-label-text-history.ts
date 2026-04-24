import { ANNOTATION_TYPES } from "../types/annotation-types";

const TRAILING_NUMBER_PATTERN = /^(.*?)(\d+)$/;

export const MAX_ANNOTATION_LABEL_TEXT_HISTORY_ITEMS = 8;

export type AnnotationLabelTextSuggestionSource = {
  type?: string;
  toolType?: string;
  displayName?: string | null;
  name?: string | null;
};

export const resolveNextAnnotationLabelText = (
  lastManualText: string | null | undefined,
  fallbackText: string
): string => {
  const trimmedText = lastManualText?.trim();
  if (!trimmedText) {
    return fallbackText;
  }

  const match = trimmedText.match(TRAILING_NUMBER_PATTERN);
  if (!match) {
    return trimmedText;
  }

  const [, prefix, numberText] = match;
  const nextNumberText = String(Number(numberText) + 1).padStart(
    numberText.length,
    "0"
  );

  return `${prefix}${nextNumberText}`;
};

export const addAnnotationLabelTextHistoryEntry = (
  previousHistory: readonly string[],
  text: string
): readonly string[] => {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return previousHistory;
  }

  return [
    trimmedText,
    ...previousHistory.filter((previousText) => previousText !== trimmedText),
  ].slice(0, MAX_ANNOTATION_LABEL_TEXT_HISTORY_ITEMS);
};

export const mergeAnnotationLabelTextSuggestions = (
  ...suggestionLists: readonly (readonly string[])[]
): readonly string[] => {
  const seen = new Set<string>();
  const suggestions: string[] = [];

  suggestionLists.forEach((suggestionList) => {
    suggestionList.forEach((text) => {
      const trimmedText = text.trim();
      if (!trimmedText || seen.has(trimmedText)) {
        return;
      }

      seen.add(trimmedText);
      suggestions.push(trimmedText);
    });
  });

  return suggestions;
};

export type AnnotationLabelTextRequestOptions = {
  defaultText: string;
  labelTextHistory: readonly string[];
  labelTextSuggestions: readonly string[];
};

export const resolveAnnotationLabelTextRequest = ({
  defaultText,
  labelTextHistory,
  labelTextSuggestions,
}: AnnotationLabelTextRequestOptions): {
  initialValue: string;
  labelSuggestions: readonly string[];
} => ({
  initialValue: resolveNextAnnotationLabelText(
    labelTextHistory[0],
    defaultText
  ),
  labelSuggestions: mergeAnnotationLabelTextSuggestions(
    labelTextHistory,
    labelTextSuggestions
  ),
});

export const resolveAnnotationLabelTextSuggestions = ({
  annotationEntries,
  additionalSuggestions = [],
}: {
  annotationEntries: readonly AnnotationLabelTextSuggestionSource[];
  additionalSuggestions?: readonly string[];
}): readonly string[] => {
  const seen = new Set<string>();
  const suggestions: string[] = [];
  const addSuggestion = (text: string | null | undefined) => {
    const trimmedText = text?.trim();
    if (!trimmedText || seen.has(trimmedText)) {
      return;
    }

    seen.add(trimmedText);
    suggestions.push(trimmedText);
  };

  [...annotationEntries]
    .reverse()
    .filter(
      (entry) =>
        entry.toolType === ANNOTATION_TYPES.LABEL ||
        entry.type === ANNOTATION_TYPES.LABEL
    )
    .forEach((entry) => addSuggestion(entry.displayName ?? entry.name));

  return mergeAnnotationLabelTextSuggestions(
    suggestions,
    additionalSuggestions
  );
};
