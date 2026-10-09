import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Button, Input, Modal, type InputRef } from "antd";
import { ANNOTATION_KEYBOARD_SHORTCUTS_SUSPENDED_ATTRIBUTE } from "@carma-mapping/annotations/core";
import { useAnnotationLabelTextDialogState } from "@carma-mapping/annotations/runtime";

/** Port of the geoportal label text modal: the text of a label annotation. */
export const MEASUREMENT3D_LABEL_TEXT_MODAL_TEXT = Object.freeze({
  title: "Beschriftung",
  okText: "Übernehmen",
  cancelText: "Abbrechen",
  inputAriaLabel: "Beschriftungstext",
  inputPlaceholder: "Text der Beschriftung",
});

const resolveFinishedLabelText = (value: string, fallbackText: string) =>
  value.trim() || fallbackText;

export const Measurement3dLabelTextModal = () => {
  const { open, initialValue, labelSuggestions, onAbort, onFinish } =
    useAnnotationLabelTextDialogState();
  const inputRef = useRef<InputRef>(null);
  const [value, setValue] = useState(initialValue);
  const focusInput = useCallback(() => {
    inputRef.current?.focus({ cursor: "all" });
  }, []);
  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    const frameId = window.requestAnimationFrame(focusInput);
    return () => window.cancelAnimationFrame(frameId);
  }, [focusInput, initialValue, open]);
  const finish = useCallback(() => {
    onFinish(resolveFinishedLabelText(value, initialValue));
  }, [initialValue, onFinish, value]);
  const handlePressEnter = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      event.preventDefault();
      event.stopPropagation();
      finish();
    },
    [finish]
  );
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        onAbort();
      }
    },
    [onAbort]
  );
  const handleSuggestionMouseDown = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
    },
    []
  );
  const visibleSuggestions = useMemo(
    () =>
      labelSuggestions.filter((suggestion) => suggestion !== value.trim()),
    [labelSuggestions, value]
  );
  return (
    <Modal
      title={MEASUREMENT3D_LABEL_TEXT_MODAL_TEXT.title}
      open={open}
      onOk={finish}
      onCancel={onAbort}
      okText={MEASUREMENT3D_LABEL_TEXT_MODAL_TEXT.okText}
      cancelText={MEASUREMENT3D_LABEL_TEXT_MODAL_TEXT.cancelText}
      maskClosable={false}
      destroyOnClose
      afterOpenChange={(nextOpen) => {
        if (nextOpen) focusInput();
      }}
      modalRender={(node) => (
        <div {...{ [ANNOTATION_KEYBOARD_SHORTCUTS_SUSPENDED_ATTRIBUTE]: "" }}>
          {node}
        </div>
      )}
    >
      <div className="flex flex-col gap-2">
        <Input
          ref={inputRef}
          autoFocus
          value={value}
          aria-label={MEASUREMENT3D_LABEL_TEXT_MODAL_TEXT.inputAriaLabel}
          placeholder={MEASUREMENT3D_LABEL_TEXT_MODAL_TEXT.inputPlaceholder}
          onChange={(event) => setValue(event.target.value)}
          onPressEnter={handlePressEnter}
          onKeyDown={handleKeyDown}
          data-test-id="measurement3d-label-text-input"
        />
        {visibleSuggestions.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {visibleSuggestions.map((suggestion) => (
              <Button
                key={suggestion}
                size="small"
                onMouseDown={handleSuggestionMouseDown}
                onClick={() => {
                  setValue(suggestion);
                  window.requestAnimationFrame(focusInput);
                }}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
};
