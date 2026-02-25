/**
 * Utilities for read-only form styling.
 * Using pointer-events-none instead of disabled to keep normal visual appearance.
 */

// CSS classes applied to forms in read-only mode
export const READ_ONLY_FORM_CLASSES =
  "pointer-events-none [&_.ant-picker-suffix]:hidden [&_.ant-select-arrow]:hidden";

/**
 * Returns className string for a Form component.
 * @param readOnly - whether the form is in read-only mode
 * @param additionalClasses - any additional classes to include
 */
export const getFormClassName = (
  readOnly: boolean,
  additionalClasses = ""
): string =>
  `${additionalClasses} ${readOnly ? READ_ONLY_FORM_CLASSES : ""}`.trim();

/**
 * Returns empty string for read-only mode, otherwise the placeholder.
 * @param readOnly - whether the form is in read-only mode
 * @param placeholder - the placeholder text to show in edit mode
 */
export const getPlaceholder = (
  readOnly: boolean,
  placeholder: string
): string => (readOnly ? "" : placeholder);
