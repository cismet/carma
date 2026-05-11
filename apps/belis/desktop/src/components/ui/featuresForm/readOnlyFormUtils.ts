/**
 * Utilities for read-only form styling.
 * Using pointer-events-none instead of disabled to keep normal visual appearance.
 */

// CSS classes applied to forms in read-only mode
export const READ_ONLY_FORM_CLASSES =
  "pointer-events-none [&_.ant-picker-suffix]:hidden [&_.ant-select-arrow]:hidden";

// Shared gray fill used for "locked" form fields — e.g. the Standort tab
// when creating a Leuchte linked to an existing Mast. Both constants must
// stay in sync: LOCKED_FIELD_CLASSES uses the literal hex so Tailwind's JIT
// can statically detect the class, while LOCKED_FIELD_GRAY is the source of
// truth for non-className usage (inline styles, theme overrides).
export const LOCKED_FIELD_GRAY = "#f3f4f6";

export const LOCKED_FIELD_CLASSES =
  "[&_.ant-input]:!bg-[#f3f4f6] " +
  "[&_.ant-input-number]:!bg-[#f3f4f6] " +
  "[&_.ant-input-number-input]:!bg-[#f3f4f6] " +
  "[&_.ant-select-selector]:!bg-[#f3f4f6] " +
  "[&_.ant-picker]:!bg-[#f3f4f6] " +
  "[&_.ant-checkbox-inner]:!bg-[#f3f4f6]";

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
