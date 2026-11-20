import { useState } from "react";
import type { CSSProperties } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";

interface AreaInputProps {
  value?: number;
  onChange: (value: number | undefined) => void;
  disabled?: boolean;
  style?: CSSProperties;
}

const PARTIAL_AREA = /^\d*([.,]\d{0,2})?$/;

const parseArea = (text: string): number | undefined =>
  text === "" ? undefined : Number(text.replace(",", "."));

const formatArea = (value?: number): string =>
  value === undefined || value === null ? "" : String(value).replace(".", ",");

const AreaInput = ({
  value,
  onChange,
  disabled = false,
  style,
}: AreaInputProps) => {
  const [text, setText] = useState<string | null>(null);

  const step = (delta: number) => {
    const base = parseArea(text ?? formatArea(value)) ?? 0;
    const next = Math.max(0, Math.round((base + delta) * 100) / 100);
    setText(null);
    onChange(next);
  };

  return (
    <InputGroup>
      <InputGroup.Prepend>
        <Button
          variant="outline-secondary"
          aria-label="Größe verringern"
          disabled={disabled}
          onClick={() => step(-1)}
        >
          −
        </Button>
      </InputGroup.Prepend>
      <Form.Control
        type="text"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        style={style}
        value={text ?? formatArea(value)}
        onChange={(e) => {
          const next = e.target.value.trim();
          if (!PARTIAL_AREA.test(next)) {
            return;
          }
          setText(next);
          onChange(parseArea(next));
        }}
        onBlur={() => setText(null)}
      />
      <InputGroup.Append>
        <Button
          variant="outline-secondary"
          aria-label="Größe erhöhen"
          disabled={disabled}
          onClick={() => step(1)}
        >
          +
        </Button>
      </InputGroup.Append>
    </InputGroup>
  );
};

export default AreaInput;
