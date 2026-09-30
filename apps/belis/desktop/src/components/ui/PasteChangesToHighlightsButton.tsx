import { useMemo, useState } from "react";
import { Badge, Checkbox, Modal, Tooltip, message } from "antd";
import { LoadingOutlined, SnippetsOutlined } from "@ant-design/icons";
import { useDispatch, useSelector, useStore } from "react-redux";
import type { RootState } from "../../store";
import { getJWT, getIsReadOnly } from "../../store/slices/auth";
import {
  getAllRepeatableChanges,
  type RepeatableChangeSet,
} from "../../store/slices/repeatableChanges";
import { getAllDrafts } from "../../store/slices/featuresForms";
import { getSelectedFeature } from "../../store/slices/featureCollection";
import { useDatasheet } from "@carma-mapping/engines/maplibre";
import { useMapPage } from "../../contexts/MapPageContext";
import { countEditedFields } from "./featuresForm/formDiffUtils";
import {
  REPEATABLE_CHANGES_BADGE_COLOR,
  REPEATABLE_CHANGES_BUTTON_STYLE,
} from "./featuresForm/repeatableChangesStyles";
import {
  filterPasteTargets,
  getBatchPasteTarget,
  pasteChangesToFeatures,
} from "../../helper/pasteChangesToHighlights";

/**
 * "Wiederholfelder in die markierten Objekte einfügen" — the batch counterpart
 * of the paste button in the Datenblatt header.
 *
 * Appears in the card header next to the page title once BOTH halves are in
 * place: a change set was copied from some Datenblatt, and at least one
 * highlighted feature is of that type. One button covers every copied type
 * (Leuchte, Standort). Clicking creates one draft per highlighted feature,
 * each carrying the copied field values; nothing is sent to the server until
 * the user saves those drafts.
 */
const PasteChangesToHighlightsButton = () => {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const jwt = useSelector(getJWT) as string | null;
  const isReadOnly = useSelector(getIsReadOnly) as boolean;
  const repeatableChanges = useSelector(getAllRepeatableChanges);
  const drafts = useSelector(getAllDrafts);
  const { activeHighlights, config } = useMapPage();
  const activeSourceLayers = config.activeSourceLayers;
  const { isDatasheetOpen } = useDatasheet();
  const selectedFeature = useSelector(getSelectedFeature) as {
    id?: string | number;
    sourceLayer?: string;
    properties?: Record<string, unknown> | null;
  } | null;

  // The Fachobjekt whose Datenblatt is open, if any. It is kept out of the
  // batch: its mounted form owns the draft and would not pick the pasted
  // values up — see `filterPasteTargets`. Its own header paste button covers it.
  const openInDatasheet = isDatasheetOpen ? selectedFeature : null;

  // Every stored change set that has somewhere to go. All of them share the
  // one button: a Leuchte and a Standort clipboard are pasted in one run.
  const jobs = useMemo(() => {
    const result: PasteJob[] = [];
    for (const [featureType, changeSet] of Object.entries(repeatableChanges)) {
      const target = getBatchPasteTarget(featureType);
      if (!target) continue;
      // `activeHighlights` is the unfiltered selection — it keeps every
      // highlighted feature even for categories the user switched off on the
      // map. Pasting into objects that are neither drawn nor listed anywhere
      // would be invisible work, so the action goes away with its layer.
      if (!activeSourceLayers.has(target.sourceLayer)) continue;
      const features = filterPasteTargets(
        activeHighlights,
        featureType,
        openInDatasheet
      );
      if (features.length === 0) continue;
      result.push({
        featureType,
        changeSet,
        features,
        label: target.label,
        // Visible fields, not stored keys — the Strassenschlüssel trio is one
        // input. Same collapsing the Datenblatt header's paste badge does.
        fieldCount: countEditedFields(changeSet.paths),
      });
    }
    return result;
  }, [
    repeatableChanges,
    activeHighlights,
    openInDatasheet,
    activeSourceLayers,
  ]);
  const [pasting, setPasting] = useState(false);
  // Feature types ticked in the multi-type dialog; `null` while it is closed.
  const [selectedTypes, setSelectedTypes] = useState<Set<string> | null>(null);

  if (isReadOnly || !jwt || jobs.length === 0) return null;

  const totalFieldCount = jobs.reduce((sum, job) => sum + job.fieldCount, 0);
  const singleJob = jobs.length === 1 ? jobs[0] : null;
  const tooltip = singleJob
    ? `${singleJob.fieldCount} kopierte Felder in ${singleJob.features.length} markierte ${singleJob.label} einfügen`
    : `Kopierte Felder in markierte ${jobs
        .map((job) => job.label)
        .join(" und ")} einfügen`;

  const runPaste = async (selectedJobs: PasteJob[]) => {
    setPasting(true);
    try {
      let applied = 0;
      let unchanged = 0;
      const failedLabels: string[] = [];
      // One type after another: each run reads back the drafts the previous
      // one wrote.
      for (const job of selectedJobs) {
        const result = await pasteChangesToFeatures({
          jwt,
          featureType: job.featureType,
          features: job.features,
          changeSet: job.changeSet,
          drafts,
          dispatch,
          getDrafts: () => store.getState().featuresForms?.drafts ?? {},
        });
        applied += result.applied;
        unchanged += result.unchanged;
        if (result.failed > 0)
          failedLabels.push(`${result.failed} ${job.label}`);
      }
      // A feature that already carried the values got no draft (setDraft
      // discards a draft that matches its baseline), so it must not count as
      // "angelegt". Drafts win the sentence when there are any.
      if (applied > 0) {
        void message.success(
          `${applied} ${applied === 1 ? "Entwurf" : "Entwürfe"} angelegt`
        );
      } else if (unchanged > 0) {
        void message.info("Keine Änderungen nötig");
      }
      if (failedLabels.length > 0) {
        void message.error(
          `${failedLabels.join(", ")} konnten nicht geladen werden`
        );
      }
    } finally {
      setPasting(false);
    }
  };

  const handleClick = () => {
    if (!singleJob) {
      setSelectedTypes(new Set(jobs.map((job) => job.featureType)));
      return;
    }
    Modal.confirm({
      title: `Kopierte Änderungen in ${singleJob.features.length} markierte ${singleJob.label} einfügen?`,
      content: `Für jedes markierte Objekt wird ein Entwurf mit den ${singleJob.fieldCount} kopierten Feldern angelegt. Gespeichert wird erst über "Alle speichern".`,
      okText: "Einfügen",
      cancelText: "Abbrechen",
      onOk: () => runPaste([singleJob]),
    });
  };

  // Usually a Standort is highlighted together with its Leuchten, so the counts
  // match — then the number is said once, in the title.
  const sharedCount = jobs.every(
    (job) => job.features.length === jobs[0].features.length
  )
    ? jobs[0].features.length
    : null;
  const multiTitle =
    sharedCount != null
      ? `Kopierte Änderungen in je ${sharedCount} markierte ${jobs
          .map((job) => job.label)
          .join(" und ")} einfügen?`
      : "Kopierte Änderungen in markierte Objekte einfügen?";

  const toggleType = (featureType: string, checked: boolean) =>
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (checked) next.add(featureType);
      else next.delete(featureType);
      return next;
    });

  const handleConfirmMulti = () => {
    const selectedJobs = jobs.filter((job) =>
      selectedTypes?.has(job.featureType)
    );
    setSelectedTypes(null);
    void runPaste(selectedJobs);
  };

  return (
    <>
      <Tooltip title={tooltip}>
        {/* Same control as the paste button in the Datenblatt header — same
          square, same badge: the badge counts the fields carried in the
          clipboards, not the features they land on. */}
        <Badge
          count={totalFieldCount}
          size="small"
          offset={[-2, 2]}
          style={{ backgroundColor: REPEATABLE_CHANGES_BADGE_COLOR }}
        >
          <button
            type="button"
            onClick={handleClick}
            disabled={pasting}
            style={REPEATABLE_CHANGES_BUTTON_STYLE}
            aria-label="Kopierte Änderungen in markierte Objekte einfügen"
          >
            {pasting ? (
              <LoadingOutlined style={{ fontSize: 12 }} />
            ) : (
              <SnippetsOutlined style={{ fontSize: 12 }} />
            )}
          </button>
        </Badge>
      </Tooltip>
      <Modal
        open={selectedTypes != null}
        title={multiTitle}
        okText="Einfügen"
        cancelText="Abbrechen"
        okButtonProps={{ disabled: !selectedTypes?.size }}
        onOk={handleConfirmMulti}
        onCancel={() => setSelectedTypes(null)}
      >
        {jobs.map((job) => (
          <div key={job.featureType}>
            <Checkbox
              checked={selectedTypes?.has(job.featureType) ?? false}
              onChange={(e) => toggleType(job.featureType, e.target.checked)}
            >
              {sharedCount == null && `${job.features.length} `}
              {job.label} ({job.fieldCount}{" "}
              {job.fieldCount === 1 ? "kopiertes Feld" : "kopierte Felder"})
            </Checkbox>
          </div>
        ))}
        <p style={{ marginTop: 12, marginBottom: 0 }}>
          Gespeichert wird erst über &quot;Alle speichern&quot;.
        </p>
      </Modal>
    </>
  );
};

interface PasteJob {
  featureType: string;
  changeSet: RepeatableChangeSet;
  features: ReturnType<typeof filterPasteTargets>;
  label: string;
  fieldCount: number;
}

export default PasteChangesToHighlightsButton;
