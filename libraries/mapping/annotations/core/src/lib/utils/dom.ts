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

export const isKeyboardTargetEditable = (
  target: EventTarget | null
): boolean => {
  const targetElement =
    target instanceof Element
      ? target
      : target instanceof Node
      ? target.parentElement
      : null;

  if (isEditableElement(targetElement)) {
    return true;
  }

  return isEditableElement(document.activeElement);
};
