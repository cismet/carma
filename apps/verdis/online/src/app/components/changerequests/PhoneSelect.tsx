import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { FontAwesomeIcon as Icon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import "./PhoneSelect.css";

export interface PhoneSelectOption {
  value: string;
  label: string;
}

interface PhoneSelectProps {
  id?: string;
  value?: string;
  options: PhoneSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  isInvalid?: boolean;
  style?: CSSProperties;
}

const PhoneSelect = ({
  id,
  value,
  options,
  onChange,
  disabled = false,
  isInvalid = false,
  style,
}: PhoneSelectProps) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) {
      return;
    }
    listRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const closeOnOutside = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const choose = (v: string) => {
    if (v !== value) {
      onChange(v);
    }
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="phone-select">
      <button
        id={id}
        type="button"
        className={`form-control phone-select-trigger${
          isInvalid ? " is-invalid" : ""
        }${open ? " open" : ""}`}
        style={style}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="phone-select-label">{selected?.label ?? ""}</span>
        <svg
          className="phone-select-chevron"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          aria-hidden="true"
        >
          <path
            d="M3.5 6 8 10.5 12.5 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <ul ref={listRef} className="phone-select-list" role="listbox">
          {options.map((o) => {
            const isSelected = o.value === value;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={isSelected}
                className={isSelected ? "selected" : undefined}
                tabIndex={0}
                onClick={() => choose(o.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    choose(o.value);
                  }
                }}
              >
                <span>{o.label}</span>
                {isSelected && <Icon icon={faCheck} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default PhoneSelect;
