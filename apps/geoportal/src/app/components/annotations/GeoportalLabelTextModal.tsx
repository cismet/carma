import { Button, Input, Modal } from "antd";

import { ANNOTATION_KEYBOARD_SHORTCUTS_SUSPENDED_ATTRIBUTE } from "@carma-mapping/annotations/core";

import {
  CESIUM_ANNOTATION_CONFIG,
  type GeoportalCesiumAnnotationLabelTextModalConfig,
} from "../../config/app.config";
import { useGeoportalLabelTextModalInput } from "../../hooks/use-geoportal-label-text-modal-input";

export type GeoportalLabelTextModalProps = {
  open: boolean;
  initialValue: string;
  labelSuggestions: readonly string[];
  onAbort: () => void;
  onFinish: (text: string) => void;
  options?: GeoportalCesiumAnnotationLabelTextModalConfig;
};

export const GeoportalLabelTextModal = ({
  open,
  initialValue,
  labelSuggestions,
  onAbort,
  onFinish,
  options = CESIUM_ANNOTATION_CONFIG.labelTextModal,
}: GeoportalLabelTextModalProps) => {
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
  } = useGeoportalLabelTextModalInput({
    initialValue,
    labelSuggestions,
    onAbort,
    onFinish,
    open,
  });

  return (
    <Modal
      title={options.title}
      open={open}
      onOk={finish}
      onCancel={onAbort}
      okText={options.okText}
      cancelText={options.cancelText}
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
          autoFocus
          value={value}
          aria-label={options.inputAriaLabel}
          placeholder={options.inputPlaceholder}
          onChange={(event) => setValue(event.target.value)}
          onPressEnter={handlePressEnter}
          onKeyDown={handleKeyDown}
        />
        {visibleSuggestions.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {visibleSuggestions.map((suggestion) => (
              <Button
                key={suggestion}
                size={options.suggestionButtonSize}
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

export default GeoportalLabelTextModal;
