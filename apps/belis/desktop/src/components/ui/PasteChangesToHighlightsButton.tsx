import { useMemo, useState } from "react";
import { Badge, Modal, Tooltip, message } from "antd";
import { LoadingOutlined, SnippetsOutlined } from "@ant-design/icons";
import { useDispatch, useSelector, useStore } from "react-redux";
import type { RootState } from "../../store";
import { getJWT, getIsReadOnly } from "../../store/slices/auth";
import { getAllRepeatableChanges } from "../../store/slices/repeatableChanges";
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
 * highlighted feature is of that type. Clicking creates one draft per
 * highlighted feature, each carrying the copied field values; nothing is sent
 * to the server until the user saves those drafts.
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
  const [pasting, setPasting] = useState(false);

  // The Fachobjekt whose Datenblatt is open, if any. It is kept out of the
  // batch: its mounted form owns the draft and would not pick the pasted
  // values up — see `filterPasteTargets`. Its own header paste button covers it.
  const openInDatasheet = isDatasheetOpen ? selectedFeature : null;

  // The one stored change set that has somewhere to go. Only Leuchte offers
  // copy/paste today, so this resolves to that type or to nothing at all; the
  // loop keeps the button honest if another type is wired up later.
  const job = useMemo(() => {
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
      return { featureType, changeSet, features, label: target.label };
    }
    return null;
  }, [
    repeatableChanges,
    activeHighlights,
    openInDatasheet,
    activeSourceLayers,
  ]);

  if (isReadOnly || !jwt || !job) return null;

  // Visible fields, not stored keys — the Strassenschlüssel trio is one input.
  // Same collapsing the Datenblatt header's paste badge does.
  const fieldCount = countEditedFields(job.changeSet.paths);
  const featureCount = job.features.length;

  const runPaste = async () => {
    setPasting(true);
    try {
      const result = await pasteChangesToFeatures({
        jwt,
        featureType: job.featureType,
        features: job.features,
        changeSet: job.changeSet,
        drafts,
        dispatch,
        getDrafts: () => store.getState().featuresForms?.drafts ?? {},
      });
      // One message per run, but the two outcomes are not interchangeable: a
      // feature that already carried the values got no draft (setDraft discards
      // a draft that matches its baseline), so counting it as "angelegt" would
      // report work that did not happen — the reason a paste onto an already
      // saved selection looked successful while the Entwürfe tab stayed away.
      // Drafts win the sentence when there are any; a run that changed nothing
      // says so in neutral info style rather than success.
      if (result.applied > 0) {
        void message.success(
          `${result.applied} ${
            result.applied === 1 ? "Entwurf" : "Entwürfe"
          } angelegt`
        );
      } else if (result.unchanged > 0) {
        void message.info("Keine Änderungen nötig");
      }
      if (result.failed > 0) {
        void message.error(
          `${result.failed} ${job.label} konnten nicht geladen werden`
        );
      }
    } finally {
      setPasting(false);
    }
  };

  const handleClick = () => {
    Modal.confirm({
      title: `Kopierte Änderungen in ${featureCount} markierte ${job.label} einfügen?`,
      content: `Für jedes markierte Objekt wird ein Entwurf mit den ${fieldCount} kopierten Feldern angelegt. Gespeichert wird erst über "Alle speichern".`,
      okText: "Einfügen",
      cancelText: "Abbrechen",
      onOk: runPaste,
    });
  };

  return (
    <Tooltip
      title={`${fieldCount} kopierte Felder in ${featureCount} markierte ${job.label} einfügen`}
    >
      {/* Same control as the paste button in the Datenblatt header — same
          square, same badge: the badge counts the fields carried in the
          clipboard, not the features they land on. How many features that is
          lives in the tooltip and in the confirm dialog, where there is room
          to say it. */}
      <Badge
        count={fieldCount}
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
  );
};

export default PasteChangesToHighlightsButton;
