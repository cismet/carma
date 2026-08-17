import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowLeftOutlined,
  CloseOutlined,
  CopyOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  SnippetsOutlined,
} from "@ant-design/icons";
import { Badge, Button, Spin, Tooltip } from "antd";
import { useSelector, useDispatch } from "react-redux";
import {
  getDraftFeaturesCount,
  getAllDrafts,
  removeDraft,
  promoteDraftHiddenToPermanent,
  markFeatureDeleted,
} from "../../../store/slices/featuresForms";
import { getJWT } from "../../../store/slices/auth";
import { incrementFeatureDataVersion } from "../../../store/slices/featureCollection";
import {
  getMeasurements,
  setMeasurements,
} from "../../../store/slices/measurements";
import {
  handleSaveAllDrafts,
  buildStrassenschluesselByPk,
} from "../../../helper/featureFormSaveHelpers";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import { useSingleSave } from "./FeaturesFormsWrapper";
import { useDatasheet } from "@carma-mapping/engines/maplibre";
import SendOrDiscardAllDraftsButton from "../SendOrDiscardAllDraftsButton";
import { useMapPage } from "../../../contexts/MapPageContext";
import { useEditedFields } from "./editedFieldsContext";
import { countEditedFields } from "./formDiffUtils";
import {
  REPEATABLE_CHANGES_BADGE_COLOR,
  REPEATABLE_CHANGES_BUTTON_STYLE,
  REPEATABLE_CHANGES_COPY_STYLE,
} from "./repeatableChangesStyles";

interface FormHeaderProps {
  title: string;
  subtitle: string;
  cancelLabel?: string;
  onCancel?: () => void;
  onSave?: () => void;
  loading?: boolean;
  saving?: boolean;
  readOnly?: boolean;
  hasDraft?: boolean;
  onToggleReadOnly?: () => void;
  onBack?: () => void;
  isCreation?: boolean;
  customDraftsCount?: number;
  onSaveAll?: () => void;
  onCreateRelatedDraft?: () => void;
  createDraftButtonVariant?: "green" | "white";
  onCopyValues?: () => void;
  /** Show the Wiederholfelder copy/paste pair next to the "+" button. Leuchte
   * sets it; the other forms leave it off. */
  showRepeatableChangesButtons?: boolean;
  /** Capture the form's changed fields into the Wiederholfelder clipboard. */
  onCopyRepeatableChanges?: () => void;
  /** Stamp the stored Wiederholfelder onto the form. */
  onPasteRepeatableChanges?: () => void;
  /** Empty the Wiederholfelder clipboard for this feature type. */
  onClearRepeatableChanges?: () => void;
  /** Field count in the clipboard, shown as a badge on the paste button. */
  repeatableChangesCount?: number;
}

// A disabled <button> emits no mouse events, so a Tooltip wrapped straight
// around one never opens — exactly when the user most wants to know why the
// button is dead. Kill its pointer events and let the hover land on the span
// the Tooltip is attached to instead; the same trick the header's Cancel
// button already uses.
const DISABLED_ICON_BUTTON_STYLE: CSSProperties = {
  color: "#d9d9d9",
  cursor: "not-allowed",
  pointerEvents: "none",
};

const DISABLED_HOVER_WRAPPER_STYLE: CSSProperties = {
  display: "inline-flex",
  cursor: "not-allowed",
};

// Whether the draft badge spells out how many fields changed, as
// "nicht gespeicherte Änderungen (3)". Off for now; flip to true to bring it
// back. The count itself stays wired either way — it also decides whether the
// Wiederholfelder button group is shown — so this only gates the text.
// Annotated `boolean` on purpose: without it TS narrows to the literal `false`
// and the guarded JSX reads as dead code to the linter.
const SHOW_EDITED_COUNT_IN_DRAFT_BADGE: boolean = false;

const FormHeader = ({
  title,
  subtitle,
  cancelLabel = "",
  onCancel,
  onSave,
  loading,
  saving,
  readOnly,
  hasDraft,
  onToggleReadOnly,
  onBack,
  isCreation,
  customDraftsCount,
  onSaveAll,
  onCreateRelatedDraft,
  createDraftButtonVariant = "green",
  onCopyValues,
  showRepeatableChangesButtons,
  onCopyRepeatableChanges,
  onPasteRepeatableChanges,
  onClearRepeatableChanges,
  repeatableChangesCount = 0,
}: FormHeaderProps) => {
  const dispatch = useDispatch();
  // Fields the user actually changed in this Datenblatt — the plain diff of
  // the draft against the saved values, across every slice the form manages
  // (Leuchte plus its Standort/Mast tab). Narrower than the set behind the
  // gray highlight, which also folds in allowlisted creation-default
  // divergences; see editedFieldsContext for why.
  const editedFields = useEditedFields();
  // Not `editedFields.size` — several form keys can back one visible field
  // (the Strassenschlüssel trio), and the badge counts what the user sees.
  const editedCount = useMemo(
    () => countEditedFields(editedFields),
    [editedFields]
  );
  const featureDraftsCount = useSelector(getDraftFeaturesCount);
  const drafts = useSelector(getAllDrafts);
  const jwt = useSelector(getJWT);
  const measurements = useSelector(getMeasurements);
  const keyTablesData = useSelector(getKeyTablesData);
  const strassenschluesselByPk = useMemo(
    () =>
      buildStrassenschluesselByPk(
        keyTablesData["straßenschlüssel"] as
          | ReadonlyArray<{ id?: unknown; pk?: unknown }>
          | undefined
      ),
    [keyTablesData]
  );
  const [savingAll, setSavingAll] = useState(false);
  const { onSaveSingle, savingSingle } = useSingleSave();
  const { closeDatasheet } = useDatasheet();
  const { onDraftsCleared } = useMapPage();

  // The copy button is "hidden" until the user holds Alt — keeps the header
  // uncluttered while exposing the power-user copy action on demand.
  const [isAltPressed, setIsAltPressed] = useState(false);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) setIsAltPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey) setIsAltPressed(false);
    };
    // Reset when the window loses focus so the button does not stay stuck
    // visible after an Alt+Tab away.
    const handleBlur = () => setIsAltPressed(false);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  const draftsCount = customDraftsCount ?? featureDraftsCount;

  const handleSaveAll = () => {
    if (onSaveAll) {
      onSaveAll();
      return;
    }
    handleSaveAllDrafts({
      jwt,
      drafts,
      draftCount: draftsCount,
      setSaving: setSavingAll,
      dispatch,
      removeDraft,
      promoteDraftHiddenToPermanent,
      markFeatureDeleted,
      incrementFeatureDataVersion,
      measurements,
      setMeasurements,
      // After at least one draft saved, the form on the right pane is bound to
      // a draft that no longer exists. Stay in the Datenblatt and let the host
      // re-point it (first list row when the draft was a creation); only
      // without a host handler fall back to the map.
      onSuccess: onDraftsCleared ?? closeDatasheet,
      strassenschluesselByPk,
    });
  };

  return (
    <div className="relative flex flex-col border-b border-gray-100">
      {/* Edit-mode indicator in the top-left corner —
          only shown while the form is editable */}
      {!readOnly && (
        <span className="absolute top-0 left-0 inline-flex items-center px-2.5 py-0.5 bg-[#f9fafb] opacity-90 text-[10px] font-medium text-gray-500 whitespace-nowrap">
          Bearbeitungsmodus
        </span>
      )}
      <div className="flex items-center justify-between flex-wrap p-6 gap-4">
        <div className="flex items-center gap-3 flex-shrink-0">
          {onBack && (
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={onBack}
              className="flex-shrink-0"
            />
          )}
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              readOnly ? "bg-gray-100" : "bg-blue-100"
            } transition-colors`}
          >
            {loading ? (
              <Spin size="small" />
            ) : (
              <EditOutlined
                className={`text-xl ${
                  readOnly ? "text-gray-500" : "text-blue-600"
                }`}
              />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 whitespace-nowrap">
                {title}
              </h2>
              {/* First slot in the icon row. Holding Alt swaps the green "+"
                  for the green "Werte merken" copy, so the two never sit side
                  by side sharing a look — they did nothing alike. The swap only
                  happens where `onCopyValues` is wired (Leuchte today); every
                  other form keeps the "+" whether Alt is down or not. */}
              {!readOnly && isAltPressed && onCopyValues && (
                <Tooltip title="Werte merken">
                  <button
                    type="button"
                    aria-label="Werte merken"
                    onClick={onCopyValues}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 24,
                      height: 24,
                      padding: 0,
                      border: "1px solid #b7eb8f",
                      borderRadius: 4,
                      backgroundColor: "#f6ffed",
                      color: "#52c41a",
                      cursor: "pointer",
                    }}
                  >
                    <CopyOutlined style={{ fontSize: 12 }} />
                  </button>
                </Tooltip>
              )}
              {!readOnly &&
                onCreateRelatedDraft &&
                !(isAltPressed && onCopyValues) && (
                  <Tooltip
                    title={
                      createDraftButtonVariant === "white"
                        ? "Neuen Datensatz anlegen"
                        : "Neuen Datensatz mit diesen Werten anlegen"
                    }
                  >
                    <button
                      type="button"
                      aria-label={
                        createDraftButtonVariant === "white"
                          ? "Neuen Datensatz anlegen"
                          : "Neuen Datensatz mit diesen Werten anlegen"
                      }
                      onClick={onCreateRelatedDraft}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 24,
                        height: 24,
                        padding: 0,
                        border:
                          createDraftButtonVariant === "white"
                            ? "1px solid #d9d9d9"
                            : "1px solid #b7eb8f",
                        borderRadius: 4,
                        backgroundColor:
                          createDraftButtonVariant === "white"
                            ? "#ffffff"
                            : "#f6ffed",
                        color:
                          createDraftButtonVariant === "white"
                            ? "#8c8c8c"
                            : "#52c41a",
                        cursor: "pointer",
                      }}
                    >
                      <PlusOutlined style={{ fontSize: 12 }} />
                    </button>
                  </Tooltip>
                )}
              {/* Wiederholfelder copy/paste. Neutral gray rather than the
                  green of the "+" beside them: these do not create a record.
                  Icon-only by request; the aria-labels are for screen readers
                  and never painted.

                  The group shows when there is something to do with it: either
                  this form has a change worth copying, or the clipboard holds
                  one. The second half is what makes paste reachable — you copy
                  on one Leuchte and the group then follows you to every other
                  Leuchte, which is untouched and would otherwise hide it.

                  Paste carries a badge with the clipboard's field count, and
                  is inert while that count is 0 — with nothing stored there is
                  nothing to stamp on. Copy stays live either way: it reports
                  "nothing changed" itself, which is more useful than a button
                  that looks broken. */}
              {!readOnly &&
                showRepeatableChangesButtons &&
                (editedCount > 0 || repeatableChangesCount > 0) && (
                  <>
                    <Tooltip title="Änderungen kopieren">
                      <button
                        type="button"
                        aria-label="Änderungen kopieren"
                        onClick={onCopyRepeatableChanges}
                        style={REPEATABLE_CHANGES_COPY_STYLE}
                      >
                        <CopyOutlined style={{ fontSize: 12 }} />
                      </button>
                    </Tooltip>
                    <Tooltip title="Änderungen einfügen">
                      <span style={DISABLED_HOVER_WRAPPER_STYLE}>
                        <Badge
                          count={repeatableChangesCount}
                          size="small"
                          offset={[-2, 2]}
                          style={{
                            backgroundColor: REPEATABLE_CHANGES_BADGE_COLOR,
                          }}
                        >
                          <button
                            type="button"
                            aria-label="Änderungen einfügen"
                            onClick={onPasteRepeatableChanges}
                            disabled={repeatableChangesCount === 0}
                            style={{
                              ...REPEATABLE_CHANGES_BUTTON_STYLE,
                              ...(repeatableChangesCount === 0
                                ? DISABLED_ICON_BUTTON_STYLE
                                : null),
                            }}
                          >
                            <SnippetsOutlined style={{ fontSize: 12 }} />
                          </button>
                        </Badge>
                      </span>
                    </Tooltip>
                    {/* Empties the clipboard for this feature type. Inert at 0
                      for the same reason as paste — nothing to throw away. */}
                    <Tooltip title="Änderungsspeicher zurücksetzen">
                      <span style={DISABLED_HOVER_WRAPPER_STYLE}>
                        <button
                          type="button"
                          aria-label="Änderungsspeicher zurücksetzen"
                          onClick={onClearRepeatableChanges}
                          disabled={repeatableChangesCount === 0}
                          style={{
                            ...REPEATABLE_CHANGES_BUTTON_STYLE,
                            ...(repeatableChangesCount === 0
                              ? DISABLED_ICON_BUTTON_STYLE
                              : null),
                          }}
                        >
                          <CloseOutlined style={{ fontSize: 12 }} />
                        </button>
                      </span>
                    </Tooltip>
                  </>
                )}
              {/* Draft indicator, placed after the icon group so the title and
                  its actions read as one block and the badge closes the row. */}
              {hasDraft && (
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full border border-gray-300 bg-[#f9fafb] text-gray-500 text-xs font-medium">
                  <ExclamationCircleOutlined className="text-[11px]" />
                  nicht gespeicherte Änderungen
                  {/* How many fields carry those changes. Currently switched
                      off — see SHOW_EDITED_COUNT_IN_DRAFT_BADGE. Omitted at 0
                      when on: a draft can also exist without any field edit (a
                      removed document, a changed geometry, a brand-new feature
                      whose baseline is empty), and "(0)" would read as a
                      contradiction next to the label. */}
                  {SHOW_EDITED_COUNT_IN_DRAFT_BADGE && editedCount > 0 && (
                    <span className="text-gray-700">({editedCount})</span>
                  )}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <>
              {customDraftsCount === undefined && (
                <SendOrDiscardAllDraftsButton />
              )}
              <span style={!hasDraft ? { cursor: "not-allowed" } : undefined}>
                <Button
                  onClick={hasDraft ? onCancel : undefined}
                  disabled={saving}
                  style={
                    !hasDraft
                      ? {
                          pointerEvents: "none",
                          color: "#d9d9d9",
                          borderColor: "#d9d9d9",
                          backgroundColor: "#f5f5f5",
                        }
                      : undefined
                  }
                >
                  {isCreation
                    ? "Verlassen ohne zu speichern"
                    : cancelLabel
                    ? `${cancelLabel}: zurücksetzen`
                    : "zurücksetzen"}
                </Button>
              </span>
              <span
                style={
                  !hasDraft || !onSaveSingle
                    ? { cursor: "not-allowed" }
                    : undefined
                }
              >
                <Button
                  type="primary"
                  onClick={hasDraft && onSaveSingle ? onSaveSingle : undefined}
                  loading={savingSingle}
                  style={
                    !hasDraft || !onSaveSingle
                      ? {
                          pointerEvents: "none",
                          color: "#d9d9d9",
                          borderColor: "#d9d9d9",
                          backgroundColor: "#f5f5f5",
                        }
                      : undefined
                  }
                >
                  Speichern
                </Button>
              </span>
              <Badge
                count={draftsCount}
                size="small"
                offset={[0, 0]}
                style={{
                  backgroundColor: "#faad14",
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  lineHeight: "18px",
                  padding: "0 4px",
                  fontSize: 11,
                }}
              >
                <span
                  style={
                    draftsCount === 0 ? { cursor: "not-allowed" } : undefined
                  }
                >
                  <Button
                    type="primary"
                    onClick={draftsCount >= 1 ? handleSaveAll : undefined}
                    loading={draftsCount >= 1 ? savingAll : false}
                    style={
                      draftsCount === 0
                        ? {
                            pointerEvents: "none",
                            color: "#d9d9d9",
                            borderColor: "#d9d9d9",
                            backgroundColor: "#f5f5f5",
                          }
                        : undefined
                    }
                  >
                    Alle speichern
                  </Button>
                </span>
              </Badge>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FormHeader;
