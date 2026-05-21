import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Form } from "antd";
import type { FormItemProps } from "antd";
import { getChangedPaths, getPrefilledPaths } from "./formDiffUtils";

// Holds the full set of changed field paths (e.g. "leuchte.wechseldatum")
const ChangedFieldsContext = createContext<Set<string>>(new Set());

// Paths that still match the prefill snapshot (used for green highlight)
const PrefilledFieldsContext = createContext<Set<string>>(new Set());

// Optional prefix prepended to field names (e.g. "leuchte" or "mast")
const FieldPrefixContext = createContext<string>("");

// Suppresses draft/prefill highlights within a locked section (e.g. the
// Standort tab when creating a Leuchte against an existing Mast — those
// fields should read as locked-gray, not green/prefilled).
const LockedFieldsContext = createContext<boolean>(false);

interface LockedFieldsProps {
  locked: boolean;
  children: ReactNode;
}

export const LockedFields = ({ locked, children }: LockedFieldsProps) => (
  <LockedFieldsContext.Provider value={locked}>
    {children}
  </LockedFieldsContext.Provider>
);

// ---------- Provider ----------

interface ChangedFieldsProviderProps {
  originalValues?: Record<string, unknown>;
  draftValues?: Record<string, unknown>;
  allowlistedPaths?: Set<string>;
  currentDefaults?: Record<string, unknown>;
  children: ReactNode;
}

export const ChangedFieldsProvider = ({
  originalValues,
  draftValues,
  allowlistedPaths,
  currentDefaults,
  children,
}: ChangedFieldsProviderProps) => {
  const prefilledFields = useMemo(
    () => getPrefilledPaths(draftValues, allowlistedPaths, currentDefaults),
    [draftValues, allowlistedPaths, currentDefaults]
  );
  const changedFields = useMemo(() => {
    const paths = getChangedPaths(originalValues, draftValues);
    // An allowlisted field that diverges from its remembered default counts
    // as changed (gray) — even when left empty. getChangedPaths only diffs
    // against the original values, so it never flags an empty field; the
    // divergence from the *default* is detected here: a tracked path that
    // did not earn the green highlight is, by definition, a diverged one.
    if (allowlistedPaths) {
      for (const path of allowlistedPaths) {
        if (!prefilledFields.has(path)) paths.add(path);
      }
    }
    return paths;
  }, [originalValues, draftValues, allowlistedPaths, prefilledFields]);
  return (
    <ChangedFieldsContext.Provider value={changedFields}>
      <PrefilledFieldsContext.Provider value={prefilledFields}>
        {children}
      </PrefilledFieldsContext.Provider>
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
const PREFILL_CLASS = "draft-prefilled-field";

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
.${PREFILL_CLASS} .ant-input,
.${PREFILL_CLASS} .ant-input-number,
.${PREFILL_CLASS} .ant-input-number-input,
.${PREFILL_CLASS} .ant-select-selector,
.${PREFILL_CLASS} .ant-select-selection-search-input,
.${PREFILL_CLASS} .ant-picker,
.${PREFILL_CLASS} .ant-picker-input > input,
.${PREFILL_CLASS} .ant-checkbox-wrapper {
  background: #f6ffed !important;
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
  const prefilledFields = useContext(PrefilledFieldsContext);
  const prefix = useContext(FieldPrefixContext);
  const locked = useContext(LockedFieldsContext);

  // Resolve the field name — can be a string or an array like ["prefix","field"]
  const fieldName = Array.isArray(name)
    ? name[name.length - 1]?.toString() ?? ""
    : String(name ?? "");
  const fullPath = prefix && fieldName ? `${prefix}.${fieldName}` : fieldName;
  const isPrefilled =
    !locked && fullPath !== "" && prefilledFields.has(fullPath);
  const isChanged =
    !locked && !isPrefilled && fullPath !== "" && changedFields.has(fullPath);

  if (isPrefilled || isChanged) injectStyles();

  const extra = isPrefilled ? PREFILL_CLASS : isChanged ? DRAFT_CLASS : null;

  return (
    <Form.Item
      name={name}
      className={extra ? `${className ?? ""} ${extra}`.trim() : className}
      {...rest}
    />
  );
};
