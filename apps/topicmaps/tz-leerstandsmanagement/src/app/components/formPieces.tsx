import type { ReactNode } from "react";

/** touch-sized form pieces of the capture wizard, styled by the ls-* classes in styles.css */

export const Label = ({
  children,
  required,
  gap,
  htmlFor,
}: {
  children: ReactNode;
  required?: boolean;
  gap?: boolean;
  htmlFor?: string;
}) => (
  <label className={"ls-lbl" + (gap ? " ls-lbl-gap" : "")} htmlFor={htmlFor}>
    {children} {required && <span className="ls-req">Pflicht</span>}
  </label>
);

export const Chips = <T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value?: T;
  onChange: (value: T) => void;
}) => (
  <div className="ls-chips">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        className="ls-chip"
        aria-pressed={o.value === value}
        onClick={() => onChange(o.value)}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const OptionList = <T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value?: T;
  onChange: (value: T) => void;
}) => (
  <div className="ls-opts">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        className="ls-opt"
        aria-pressed={o.value === value}
        onClick={() => onChange(o.value)}
      >
        {o.label}
      </button>
    ))}
  </div>
);
