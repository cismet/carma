import { useCallback, useMemo, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  getAADraft,
  getAPDraft,
  setAADraft,
  setAPDraft,
  removeAADraft,
  removeAPDraft,
  setAAOriginalValues,
  setAPOriginalValues,
  hasAADraftChanges,
  hasAPDraftChanges,
  getAAOriginalValues,
  getAPOriginalValues,
  getAllAADrafts,
  getAllAPDrafts,
  getTotalDraftCount,
  getAADraftCount,
  getAPDraftCount,
} from "../../../store/slices/arbeitsauftraegeDrafts";
import { ChangedFieldsProvider } from "./DraftFieldHighlight";
import type { RootState } from "../../../store";
import {
  serializeValues,
  deserializeValues,
} from "../../../helper/draftSerialize";
import { getFachobjektOfProtocol } from "@carma-appframeworks/belis";
import { getHeaderColorFromStatus } from "../../../helper/buildApGeoJson";
import ArbeitsauftragForm from "./ArbeitsauftragForm";
import ArbeitsprotokollForm from "./ArbeitsprotokollForm";

interface ArbeitsauftraegeFormsWrapperProps {
  mode: "aa" | "ap";
  id: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  loading?: boolean;
  readOnly?: boolean;
  geometry?: GeoJSON.Geometry;
  onBack?: () => void;
  fachobjektType?: string;
  aaId?: string;
}

const ArbeitsauftraegeFormsWrapper = ({
  mode,
  id,
  data,
  loading,
  readOnly = true,
  geometry,
  onBack,
  fachobjektType,
  aaId,
}: ArbeitsauftraegeFormsWrapperProps) => {
  const dispatch = useDispatch();
  const [resetKey, setResetKey] = useState(0);

  const allAADrafts = useSelector(getAllAADrafts);
  const allAPDrafts = useSelector(getAllAPDrafts);
  const totalDraftCount = useSelector(getTotalDraftCount);
  const aaDraftCount = useSelector(getAADraftCount);
  const apDraftCount = useSelector(getAPDraftCount);

  const draft = useSelector((state: RootState) =>
    mode === "aa" ? getAADraft(state, id) : getAPDraft(state, id)
  );

  const hasChanges = useSelector((state: RootState) =>
    mode === "aa"
      ? hasAADraftChanges(state, id)
      : hasAPDraftChanges(state, id)
  );

  const originalValues = useSelector((state: RootState) =>
    mode === "aa"
      ? getAAOriginalValues(state, id)
      : getAPOriginalValues(state, id)
  );

  const deserializedDraftValues = useMemo(
    () => (draft?.values ? deserializeValues(draft.values) : undefined),
    [draft?.values]
  );

  const handleDraftChange = useCallback(
    (_changedValues: Record<string, unknown>, allValues: Record<string, unknown>) => {
      if (!id) return;
      const serialized = serializeValues(allValues);
      if (mode === "aa") {
        dispatch(setAADraft({
          id,
          values: serialized,
          geometry,
          meta: {
            nummer: data?.nummer != null ? String(data.nummer) : undefined,
            team: (data?.team?.name as string | undefined) ?? undefined,
            angelegt_am: data?.angelegt_am as string | undefined,
          },
        }));
      } else {
        dispatch(setAPDraft({
          id,
          values: serialized,
          geometry,
          featureType: fachobjektType,
          aaId,
          serverData: data,
          meta: {
            protokollnummer: data?.protokollnummer != null
              ? String(data.protokollnummer)
              : undefined,
            fachobjektType,
            veranlassung: data?.veranlassung?.bezeichnung as string | undefined,
            headerColor: getHeaderColorFromStatus(data?.arbeitsprotokollstatus ?? null),
            datum: data?.datum
              ? new Date(data.datum as string).toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })
              : undefined,
            shortname: getFachobjektOfProtocol(data)?.shortname as string | undefined ?? fachobjektType,
          },
        }));
      }
    },
    [id, mode, dispatch, geometry, data, fachobjektType, aaId]
  );

  const handleOriginalValues = useCallback(
    (values: Record<string, unknown>) => {
      if (!id) return;
      const serialized = serializeValues(values);
      if (mode === "aa") {
        dispatch(setAAOriginalValues({ id, values: serialized }));
      } else {
        dispatch(setAPOriginalValues({ id, values: serialized }));
      }
    },
    [id, mode, dispatch]
  );

  const handleCancel = useCallback(() => {
    if (!id) return;
    if (mode === "aa") {
      dispatch(removeAADraft(id));
    } else {
      dispatch(removeAPDraft(id));
    }
    setResetKey((prev) => prev + 1);
  }, [id, mode, dispatch]);

  const handleSave = useCallback(() => {
    if (!id || !draft) return;
    console.log(
      `[ArbeitsauftraegeDrafts] Save ${mode.toUpperCase()}`,
      id,
      draft.values
    );
    // Update baseline to saved values
    if (draft.values && Object.keys(draft.values).length > 0) {
      if (mode === "aa") {
        dispatch(setAAOriginalValues({ id, values: draft.values }));
        dispatch(removeAADraft(id));
      } else {
        dispatch(setAPOriginalValues({ id, values: draft.values }));
        dispatch(removeAPDraft(id));
      }
    }
  }, [id, mode, draft, dispatch]);

  const handleSaveAll = useCallback(() => {
    console.log(
      `[ArbeitsauftraegeDrafts] Save ALL — AA drafts: ${aaDraftCount}, AP drafts: ${apDraftCount}`
    );

    for (const [draftId, aaDraft] of Object.entries(allAADrafts)) {
      console.log(`[ArbeitsauftraegeDrafts] AA draft "${draftId}":`, JSON.stringify(aaDraft, null, 2));
    }

    for (const [draftId, apDraft] of Object.entries(allAPDrafts)) {
      console.log(`[ArbeitsauftraegeDrafts] AP draft "${draftId}":`, JSON.stringify(apDraft, null, 2));
    }
  }, [allAADrafts, allAPDrafts, aaDraftCount, apDraftCount]);

  if (mode === "ap") {
    return (
      <ChangedFieldsProvider
        originalValues={originalValues}
        draftValues={draft?.values}
      >
        <ArbeitsprotokollForm
          key={resetKey}
          data={data}
          loading={loading}
          readOnly={readOnly}
          onBack={onBack}
          onCancel={hasChanges ? handleCancel : undefined}
          onSave={hasChanges ? handleSave : undefined}
          hasDraft={hasChanges}
          draftValues={deserializedDraftValues}
          onValuesChange={handleDraftChange}
          onOriginalValues={handleOriginalValues}
          apId={id}
          customDraftsCount={totalDraftCount}
          onSaveAll={handleSaveAll}
        />
      </ChangedFieldsProvider>
    );
  }

  return (
    <ChangedFieldsProvider
      originalValues={originalValues}
      draftValues={draft?.values}
    >
      <ArbeitsauftragForm
        key={resetKey}
        data={data}
        loading={loading}
        readOnly={readOnly}
        onCancel={hasChanges ? handleCancel : undefined}
        onSave={hasChanges ? handleSave : undefined}
        hasDraft={hasChanges}
        draftValues={deserializedDraftValues}
        onValuesChange={handleDraftChange}
        onOriginalValues={handleOriginalValues}
        customDraftsCount={totalDraftCount}
        onSaveAll={handleSaveAll}
      />
    </ChangedFieldsProvider>
  );
};

export default ArbeitsauftraegeFormsWrapper;
