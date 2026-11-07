import { Button, Input, Modal } from "antd";

import { ANNOTATION_KEYBOARD_SHORTCUTS_SUSPENDED_ATTRIBUTE } from "@carma-mapping/annotations/core";

import {
  useAnnotationLabelTextInput,
  type UseAnnotationLabelTextInputOptions,
} from "./use-annotation-label-text-input";

export type AnnotationLabelTextModalTexts = Readonly<{
  title: string;
  okText: string;
  cancelText: string;
  inputAriaLabel: string;
  inputPlaceholder: string;
  suggestionButtonSize: "small" | "middle" | "large";
}>;

export type AnnotationLabelTextModalProps =
  UseAnnotationLabelTextInputOptions & {
    texts: AnnotationLabelTextModalTexts;
    inputDataTestId?: string;
  };

/** The text dialog of a label annotation, with the texts the host injects. */
export const AnnotationLabelTextModal = ({
  texts,
  inputDataTestId,
  ...inputOptions
}: AnnotationLabelTextModalProps) => {
  const { open, onAbort } = inputOptions;
  const {
    finish,
    focusInput,
    handleKeyDown,
    handlePressEnter,
    handleSuggestionMouseDown,
    inputRef,
    selectSuggestion,
    setValue,
    value,
    visibleSuggestions,
  } = useAnnotationLabelTextInput(inputOptions);

  return (
    <Modal
      title={texts.title}
      open={open}
      onOk={finish}
      onCancel={onAbort}
      okText={texts.okText}
      cancelText={texts.cancelText}
      maskClosable={false}
      destroyOnClose
      afterOpenChange={(nextOpen) => {
        if (nextOpen) {
          focusInput();
        }
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
          value={value}
          aria-label={texts.inputAriaLabel}
          placeholder={texts.inputPlaceholder}
          onChange={(event) => setValue(event.target.value)}
          onPressEnter={handlePressEnter}
          onKeyDown={handleKeyDown}
          data-test-id={inputDataTestId}
        />
        {visibleSuggestions.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {visibleSuggestions.map((suggestion) => (
              <Button
                key={suggestion}
                size={texts.suggestionButtonSize}
                onMouseDown={handleSuggestionMouseDown}
                onClick={() => selectSuggestion(suggestion)}
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
