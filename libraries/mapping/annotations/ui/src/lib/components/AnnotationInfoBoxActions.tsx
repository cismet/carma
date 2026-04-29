import {
  faArrowsDownToLine,
  faDownload,
  faEye,
  faEyeSlash,
  faLock,
  faLockOpen,
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
  onFlyTo: AnnotationInfoBoxActionHandler;
  onExport: AnnotationInfoBoxActionHandler;
  onToggleVisibility: AnnotationInfoBoxActionHandler;
  onToggleLock: AnnotationInfoBoxActionHandler;
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

export const AnnotationInfoBoxActions = ({
  hidden = false,
  locked = false,
  onFlyTo,
  onExport,
  onToggleVisibility,
  onToggleLock,
  onDelete,
  onSetReference,
  visualOptions,
  dataTestIdPrefix,
  dataTestIds,
}: AnnotationInfoBoxActionsProps) => {
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
          title="Zur Messung fliegen"
          icon={faSearchLocation}
          onClick={onFlyTo}
          dataTestId={dataTestIds?.flyTo ?? `${dataTestIdPrefix}-flyto-btn`}
          visualOptions={visualOptions}
        />
      ) : null}
      {isActionVisible(ANNOTATION_INFO_BOX_ACTION_IDS.EXPORT) ? (
        <AnnotationInfoBoxActionIcon
          actionId={ANNOTATION_INFO_BOX_ACTION_IDS.EXPORT}
          title="Als GeoJSON exportieren"
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
          title={hidden ? "Einblenden" : "Ausblenden"}
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
          title="Als Referenzhöhe setzen"
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
          title={locked ? "Entsperren" : "Sperren"}
          icon={locked ? faLock : faLockOpen}
          onClick={onToggleLock}
          dataTestId={
            dataTestIds?.lock ?? `${dataTestIdPrefix}-toggle-lock-btn`
          }
          visualOptions={visualOptions}
        />
      ) : null}
      {isActionVisible(ANNOTATION_INFO_BOX_ACTION_IDS.DELETE) ? (
        <AnnotationInfoBoxActionIcon
          actionId={ANNOTATION_INFO_BOX_ACTION_IDS.DELETE}
          title={
            locked ? "Gesperrte Messung kann nicht gelöscht werden" : "Löschen"
          }
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
