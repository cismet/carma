export const ANNOTATION_KEYBOARD_SHORTCUTS_SUSPENDED_ATTRIBUTE =
  "data-annotation-keyboard-shortcuts-suspended";

const isEditableElement = (element: Element | null): boolean => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.isContentEditable) {
    return true;
  }

  const editableAncestor = element.closest(
    "input, textarea, select, [contenteditable]:not([contenteditable='false'])"
  );

  return editableAncestor instanceof HTMLElement;
};

const isShortcutSuspendedElement = (element: Element | null): boolean => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    element.closest(`[${ANNOTATION_KEYBOARD_SHORTCUTS_SUSPENDED_ATTRIBUTE}]`)
  );
};

const resolveTargetElement = (target: EventTarget | null): Element | null =>
  target instanceof Element
    ? target
    : target instanceof Node
    ? target.parentElement
    : null;

export const isKeyboardTargetEditable = (
  target: EventTarget | null
): boolean => {
  const targetElement = resolveTargetElement(target);

  if (isEditableElement(targetElement)) {
    return true;
  }

  return isEditableElement(document.activeElement);
};

export const isKeyboardTargetBlockedForAnnotationShortcuts = (
  target: EventTarget | null
): boolean => {
  const targetElement = resolveTargetElement(target);

  return (
    isKeyboardTargetEditable(target) ||
    isShortcutSuspendedElement(targetElement) ||
    isShortcutSuspendedElement(document.activeElement)
  );
};
