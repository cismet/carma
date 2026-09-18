import { useState, type MouseEvent, type ReactNode } from "react";
import { Button, Radio, Space } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faWindowRestore,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

/** Shared header actions for floating and detached diagnostic windows. */
export function DiagnosticWindowActions({
  label,
  external,
  onToggleExternal,
  onClose,
  children,
}: {
  label: string;
  external: boolean;
  onToggleExternal: (event: MouseEvent<HTMLElement>) => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Space size={0} className="tile-debug-window-controls">
      {children}
      <Button
        type="text"
        icon={
          <FontAwesomeIcon
            icon={external ? faWindowRestore : faArrowUpRightFromSquare}
          />
        }
        title={external ? `Dock ${label}` : `Undock ${label}`}
        aria-label={external ? `Dock ${label}` : `Undock ${label}`}
        onClick={onToggleExternal}
      />
      <Button
        type="text"
        icon={<FontAwesomeIcon icon={faXmark} />}
        title={`Close ${label}`}
        aria-label={`Close ${label}`}
        onClick={onClose}
      />
    </Space>
  );
}

export function DiagnosticChoice<T extends string | boolean>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: T;
  choices: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        {label}
      </legend>
      <Radio.Group
        aria-label={label}
        value={value}
        style={{ display: "flex", flexWrap: "wrap", gap: "4px 0" }}
        onChange={(event) => {
          const choice = choices.find(
            ({ value }) => value === event.target.value
          );
          if (choice) onChange(choice.value);
        }}
      >
        {choices.map((choice) => (
          <Radio key={String(choice.value)} value={choice.value}>
            {choice.label}
          </Radio>
        ))}
      </Radio.Group>
    </fieldset>
  );
}

export const DIAGNOSTIC_BOOLEAN_CHOICES = [
  { value: false, label: "Off" },
  { value: true, label: "On" },
] as const;

export function DiagnosticSection({
  title,
  children,
  initiallyOpen = true,
}: {
  title: string;
  children: ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>{title}</summary>
      <div>{children}</div>
    </details>
  );
}
