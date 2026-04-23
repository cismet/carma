const TRAILING_NUMBER_PATTERN = /^(.*?)(\d+)$/;

export const MAX_ANNOTATION_LABEL_TEXT_HISTORY_ITEMS = 8;

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
