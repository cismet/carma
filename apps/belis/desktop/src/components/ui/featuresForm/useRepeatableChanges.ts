import { useCallback, useMemo, type MutableRefObject } from "react";
import type { FormInstance } from "antd";
import { message } from "antd";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "../../../store";
import {
  clearRepeatableChanges,
  getRepeatableChanges,
  setRepeatableChanges,
} from "../../../store/slices/repeatableChanges";
import {
  serializeValues,
  deserializeValues,
} from "../../../helper/draftSerialize";
import { useEditedFields } from "./editedFieldsContext";
import { countEditedFields, pickPathValues } from "./formDiffUtils";

/**
 * Wiederholfelder (header copy/paste) for one Datenblatt form.
 *
 * `slice` is the draft key the form's values live under (`"leuchte"` →
 * `{ leuchte: {...} }`), or `null` for a form whose fields sit flat on the
 * draft (Standort). Only paths inside that slice are captured: they are the
 * only ones `formRef` can write back on paste.
 */
export const useRepeatableChanges = ({
  featureType,
  slice,
  formRef,
  excludedFields,
  onPaste,
}: {
  featureType: string;
  slice: string | null;
  formRef: MutableRefObject<FormInstance | null>;
  /** Field names never captured, e.g. read-only or per-object identity. */
  excludedFields?: ReadonlySet<string>;
  /** Push the form's values into the draft after paste — `setFieldsValue`
   *  bypasses antd's `onValuesChange`. */
  onPaste: (formValues: Record<string, unknown>) => void;
}) => {
  const dispatch = useDispatch();
  const editedFields = useEditedFields();
  const editedPaths = useMemo(
    () =>
      [...editedFields].filter((p) => {
        const field = slice
          ? p.startsWith(`${slice}.`)
            ? p.slice(slice.length + 1)
            : null
          : p;
        return field != null && !excludedFields?.has(field);
      }),
    [editedFields, slice, excludedFields]
  );
  const stored = useSelector((state: RootState) =>
    getRepeatableChanges(state, featureType)
  );
  // Visible fields, not stored keys: the Strassenschlüssel trio is one input.
  const count = useMemo(() => countEditedFields(stored?.paths ?? []), [stored]);

  const onCopy = useCallback(() => {
    // The live form is current for a keystroke Redux has not round-tripped yet.
    const formValues = serializeValues(formRef.current?.getFieldsValue() ?? {});
    const source = slice ? { [slice]: formValues } : formValues;
    const values = pickPathValues(source, editedPaths);
    // Derived from what was picked: a changed path the form doesn't carry is
    // skipped by pickPathValues and must not inflate the badge.
    const picked = (slice ? values[slice] ?? {} : values) as Record<
      string,
      unknown
    >;
    const paths = Object.keys(picked).map((f) => (slice ? `${slice}.${f}` : f));
    if (paths.length === 0) {
      message.warning("Keine Änderungen zum Kopieren");
      return;
    }
    dispatch(setRepeatableChanges({ featureType, values, paths }));
  }, [dispatch, editedPaths, featureType, formRef, slice]);

  const onPasteClick = useCallback(() => {
    const form = formRef.current;
    if (!form || !stored) return;
    const raw = (slice ? stored.values[slice] ?? {} : stored.values) as Record<
      string,
      unknown
    >;
    const values = deserializeValues(raw);
    if (Object.keys(values).length === 0) return;
    form.setFieldsValue(values);
    onPaste(form.getFieldsValue());
  }, [formRef, stored, slice, onPaste]);

  const onClear = useCallback(() => {
    // Only the clipboard: values already pasted stay in their drafts.
    dispatch(clearRepeatableChanges(featureType));
    message.success("Kopierte Änderungen verworfen");
  }, [dispatch, featureType]);

  return { onCopy, onPaste: onPasteClick, onClear, count };
};
