import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Form } from "antd";
import type { FormItemProps } from "antd";
import { getChangedPaths } from "./formDiffUtils";

// Holds the full set of changed field paths (e.g. "leuchte.wechseldatum")
const ChangedFieldsContext = createContext<Set<string>>(new Set());

// Optional prefix prepended to field names (e.g. "leuchte" or "mast")
const FieldPrefixContext = createContext<string>("");

// ---------- Provider ----------

interface ChangedFieldsProviderProps {
  originalValues?: Record<string, unknown>;
  draftValues?: Record<string, unknown>;
  children: ReactNode;
}

export const ChangedFieldsProvider = ({
  originalValues,
  draftValues,
  children,
}: ChangedFieldsProviderProps) => {
  const changedFields = useMemo(
    () => getChangedPaths(originalValues, draftValues),
    [originalValues, draftValues]
  );
  return (
    <ChangedFieldsContext.Provider value={changedFields}>
      {children}
    </ChangedFieldsContext.Provider>
  );
};

// ---------- Field Prefix ----------

interface FieldPrefixProps {
  name: string;
  children: ReactNode;
}

export const FieldPrefix = ({ name, children }: FieldPrefixProps) => (
  <FieldPrefixContext.Provider value={name}>
    {children}
  </FieldPrefixContext.Provider>
);

// ---------- Draft-aware Form.Item ----------

const DRAFT_CLASS = "draft-changed-field";

const draftStyles = `
.${DRAFT_CLASS} .ant-input,
.${DRAFT_CLASS} .ant-input-number,
.${DRAFT_CLASS} .ant-input-number-input,
.${DRAFT_CLASS} .ant-select-selector,
.${DRAFT_CLASS} .ant-select-selection-search-input,
.${DRAFT_CLASS} .ant-picker,
.${DRAFT_CLASS} .ant-picker-input > input,
.${DRAFT_CLASS} .ant-checkbox-wrapper {
  background: #f5f5f5 !important;
  transition: background 0.2s;
}
`;

let styleInjected = false;
const injectStyles = () => {
  if (styleInjected) return;
  const tag = document.createElement("style");
  tag.textContent = draftStyles;
  document.head.appendChild(tag);
  styleInjected = true;
};

export const FormItem = ({ name, className, ...rest }: FormItemProps) => {
  const changedFields = useContext(ChangedFieldsContext);
  const prefix = useContext(FieldPrefixContext);

  // Resolve the field name — can be a string or an array like ["prefix","field"]
  const fieldName = Array.isArray(name)
    ? name[name.length - 1]?.toString() ?? ""
    : String(name ?? "");
  const fullPath = prefix && fieldName ? `${prefix}.${fieldName}` : fieldName;
  const isChanged = fullPath !== "" && changedFields.has(fullPath);

  if (isChanged) injectStyles();

  return (
    <Form.Item
      name={name}
      className={
        isChanged ? `${className ?? ""} ${DRAFT_CLASS}`.trim() : className
      }
      {...rest}
    />
  );
};
