import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Input, Modal, type InputRef } from "antd";

import {
  ANNOTATION_KEYBOARD_SHORTCUTS_SUSPENDED_ATTRIBUTE,
} from "@carma-mapping/annotations/core";

export type GeoportalLabelTextModalProps = {
  open: boolean;
  initialValue: string;
  labelSuggestions: readonly string[];
  onAbort: () => void;
  onFinish: (text: string) => void;
};

export const GeoportalLabelTextModal = ({
  open,
  initialValue,
  labelSuggestions,
  onAbort,
  onFinish,
}: GeoportalLabelTextModalProps) => {
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
    onFinish(value.trim() || initialValue);
  }, [initialValue, onFinish, value]);

  const visibleSuggestions = labelSuggestions.filter(
    (suggestion) => suggestion !== value.trim()
  );

  return (
    <Modal
      title="Beschriftung hinzufügen"
      open={open}
      onOk={finish}
      onCancel={onAbort}
      okText="Hinzufügen"
      cancelText="Abbrechen"
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
          aria-label="Text der Beschriftung"
          placeholder="Text der Beschriftung"
          onChange={(event) => setValue(event.target.value)}
          onPressEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
            finish();
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              event.preventDefault();
              onAbort();
            }
          }}
        />
        {visibleSuggestions.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {visibleSuggestions.map((suggestion) => (
              <Button
                key={suggestion}
                size="small"
                onMouseDown={(event) => event.preventDefault()}
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

export default GeoportalLabelTextModal;
