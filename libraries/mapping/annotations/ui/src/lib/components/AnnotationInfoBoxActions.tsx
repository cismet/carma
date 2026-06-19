import {
  faArrowsDownToLine,
  faDownload,
  faEye,
  faEyeSlash,
  faLock,
  faLockOpen,
  faPalette,
  faSearchLocation,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import type { MouseEvent as ReactMouseEvent } from "react";

import { AnnotationInfoBoxActionIcon } from "./AnnotationInfoBoxActionIcon";
import {
  ANNOTATION_INFO_BOX_ACTION_IDS,
  type AnnotationInfoBoxActionId,
  type AnnotationInfoBoxVisualOptions,
} from "../annotation-info-box.types";

export type AnnotationInfoBoxActionsProps = {
  hidden?: boolean;
  locked?: boolean;
  labels?: Partial<AnnotationInfoBoxActionLabels>;
  onFlyTo: AnnotationInfoBoxActionHandler;
  onExport: AnnotationInfoBoxActionHandler;
  onToggleVisibility: AnnotationInfoBoxActionHandler;
  onToggleLock: AnnotationInfoBoxActionHandler;
  onEditStyle?: AnnotationInfoBoxActionHandler;
  onDelete: AnnotationInfoBoxActionHandler;
  onSetReference?: AnnotationInfoBoxActionHandler;
  visualOptions?: AnnotationInfoBoxVisualOptions;
  dataTestIdPrefix: string;
  dataTestIds?: Partial<{
    flyTo: string;
    export: string;
    visibility: string;
    reference: string;
    lock: string;
    delete: string;
  }>;
};

type AnnotationInfoBoxActionHandler = (
  event: ReactMouseEvent<HTMLElement, MouseEvent>
) => void;

export type AnnotationInfoBoxActionLabels = Readonly<{
  flyTo: string;
  exportGeoJson: string;
  show: string;
  hide: string;
  setReference: string;
  lock: string;
  unlock: string;
  editStyle: string;
  delete: string;
  deleteLocked: string;
}>;

export const DEFAULT_ANNOTATION_INFO_BOX_ACTION_LABELS =
  Object.freeze<AnnotationInfoBoxActionLabels>({
    flyTo: "Zur Messung fliegen",
    exportGeoJson: "Als GeoJSON exportieren",
    show: "Einblenden",
    hide: "Ausblenden",
    setReference: "Als Referenzhöhe setzen",
    lock: "Sperren",
    unlock: "Entsperren",
    editStyle: "Darstellung bearbeiten",
    delete: "Löschen",
    deleteLocked: "Gesperrte Messung kann nicht gelöscht werden",
  });

export const AnnotationInfoBoxActions = ({
  hidden = false,
  locked = false,
  labels,
  onFlyTo,
  onExport,
  onToggleVisibility,
  onToggleLock,
  onEditStyle,
  onDelete,
  onSetReference,
  visualOptions,
  dataTestIdPrefix,
  dataTestIds,
}: AnnotationInfoBoxActionsProps) => {
  const resolvedLabels = {
    ...DEFAULT_ANNOTATION_INFO_BOX_ACTION_LABELS,
    ...labels,
  };
  const hiddenActionIds = new Set<AnnotationInfoBoxActionId>(
    visualOptions?.hiddenActionIds ?? []
  );
  const isActionVisible = (actionId: AnnotationInfoBoxActionId): boolean =>
    !hiddenActionIds.has(actionId);

  return (
    <div className="flex items-center gap-2">
      {isActionVisible(ANNOTATION_INFO_BOX_ACTION_IDS.FLY_TO) ? (
        <AnnotationInfoBoxActionIcon
          actionId={ANNOTATION_INFO_BOX_ACTION_IDS.FLY_TO}
          title={resolvedLabels.flyTo}
          icon={faSearchLocation}
          onClick={onFlyTo}
          dataTestId={dataTestIds?.flyTo ?? `${dataTestIdPrefix}-flyto-btn`}
          visualOptions={visualOptions}
        />
      ) : null}
      {isActionVisible(ANNOTATION_INFO_BOX_ACTION_IDS.EXPORT) ? (
        <AnnotationInfoBoxActionIcon
          actionId={ANNOTATION_INFO_BOX_ACTION_IDS.EXPORT}
          title={resolvedLabels.exportGeoJson}
          icon={faDownload}
          onClick={onExport}
          dataTestId={
            dataTestIds?.export ?? `${dataTestIdPrefix}-export-geojson-btn`
          }
          visualOptions={visualOptions}
        />
      ) : null}
      {isActionVisible(ANNOTATION_INFO_BOX_ACTION_IDS.VISIBILITY) ? (
        <AnnotationInfoBoxActionIcon
          actionId={ANNOTATION_INFO_BOX_ACTION_IDS.VISIBILITY}
          title={hidden ? resolvedLabels.show : resolvedLabels.hide}
          icon={hidden ? faEyeSlash : faEye}
          onClick={onToggleVisibility}
          dataTestId={
            dataTestIds?.visibility ??
            `${dataTestIdPrefix}-toggle-visibility-btn`
          }
          visualOptions={visualOptions}
        />
      ) : null}
      {onSetReference &&
      isActionVisible(ANNOTATION_INFO_BOX_ACTION_IDS.REFERENCE) ? (
        <AnnotationInfoBoxActionIcon
          actionId={ANNOTATION_INFO_BOX_ACTION_IDS.REFERENCE}
          title={resolvedLabels.setReference}
          icon={faArrowsDownToLine}
          onClick={onSetReference}
          dataTestId={
            dataTestIds?.reference ?? `${dataTestIdPrefix}-set-reference-btn`
          }
          visualOptions={visualOptions}
        />
      ) : null}
      {isActionVisible(ANNOTATION_INFO_BOX_ACTION_IDS.LOCK) ? (
        <AnnotationInfoBoxActionIcon
          actionId={ANNOTATION_INFO_BOX_ACTION_IDS.LOCK}
          title={locked ? resolvedLabels.unlock : resolvedLabels.lock}
          icon={locked ? faLock : faLockOpen}
          onClick={onToggleLock}
          dataTestId={
            dataTestIds?.lock ?? `${dataTestIdPrefix}-toggle-lock-btn`
          }
          visualOptions={visualOptions}
        />
      ) : null}
      {onEditStyle && isActionVisible(ANNOTATION_INFO_BOX_ACTION_IDS.STYLE) ? (
        <AnnotationInfoBoxActionIcon
          actionId={ANNOTATION_INFO_BOX_ACTION_IDS.STYLE}
          title={resolvedLabels.editStyle}
          icon={faPalette}
          onClick={onEditStyle}
          visualOptions={visualOptions}
        />
      ) : null}
      {isActionVisible(ANNOTATION_INFO_BOX_ACTION_IDS.DELETE) ? (
        <AnnotationInfoBoxActionIcon
          actionId={ANNOTATION_INFO_BOX_ACTION_IDS.DELETE}
          title={locked ? resolvedLabels.deleteLocked : resolvedLabels.delete}
          icon={faTrashCan}
          onClick={onDelete}
          dataTestId={dataTestIds?.delete ?? `${dataTestIdPrefix}-delete-btn`}
          disabled={locked}
          visualOptions={visualOptions}
        />
      ) : null}
    </div>
  );
};
