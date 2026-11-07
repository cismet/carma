import { ANNOTATION_TYPES } from "../types/annotation-types";

const TRAILING_NUMBER_PATTERN = /^(.*?)(\d+)$/;

const MAX_ANNOTATION_LABEL_TEXT_HISTORY_ITEMS = 8;

type AnnotationLabelTextSuggestionSource = {
  type?: string;
  toolType?: string;
  displayName?: string | null;
  name?: string | null;
};

const resolveNextAnnotationLabelText = (
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

const parseIncrementalLabelText = (
  text: string
): { baseText: string; prefix: string } | null => {
  const match = text.match(TRAILING_NUMBER_PATTERN);
  if (!match) {
    return null;
  }

  const [, prefix] = match;
  const baseText = prefix.trimEnd();

  return baseText ? { baseText, prefix } : null;
};

const collapseIncrementalLabelTextSuggestions = (
  orderedSuggestions: readonly string[]
): readonly string[] => {
  const baseSuggestionSet = new Set(
    orderedSuggestions.filter(
      (suggestion) => !parseIncrementalLabelText(suggestion)
    )
  );
  const seenIncrementalPrefixes = new Set<string>();

  return orderedSuggestions.filter((suggestion) => {
    const incrementalText = parseIncrementalLabelText(suggestion);
    if (!incrementalText) {
      return true;
    }

    if (baseSuggestionSet.has(incrementalText.baseText)) {
      return false;
    }

    if (seenIncrementalPrefixes.has(incrementalText.prefix)) {
      return false;
    }

    seenIncrementalPrefixes.add(incrementalText.prefix);
    return true;
  });
};

export const mergeAnnotationLabelTextSuggestions = (
  ...suggestionLists: readonly (readonly string[])[]
): readonly string[] =>
  collapseIncrementalLabelTextSuggestions([
    ...new Set(
      suggestionLists
        .flat()
        .map((text) => text.trim())
        .filter(Boolean)
    ),
  ]);

type AnnotationLabelTextRequestOptions = {
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
}): readonly string[] =>
  mergeAnnotationLabelTextSuggestions(
    [...annotationEntries]
      .reverse()
      .filter(
        (entry) =>
          entry.toolType === ANNOTATION_TYPES.LABEL ||
          entry.type === ANNOTATION_TYPES.LABEL
      )
      .flatMap((entry) => entry.displayName ?? entry.name ?? []),
    additionalSuggestions
  );
