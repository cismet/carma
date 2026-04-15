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
import type { AnnotationInfoBoxVisualOptions } from "../annotation-info-box.types";

type AnnotationInfoBoxActionsProps = {
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
  event: ReactMouseEvent<SVGSVGElement, MouseEvent>
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
}: AnnotationInfoBoxActionsProps) => (
  <div className="flex items-center gap-2">
    <AnnotationInfoBoxActionIcon
      title="Zur Messung fliegen"
      icon={faSearchLocation}
      onClick={onFlyTo}
      dataTestId={dataTestIds?.flyTo ?? `${dataTestIdPrefix}-flyto-btn`}
      visualOptions={visualOptions}
    />
    <AnnotationInfoBoxActionIcon
      title="Als GeoJSON exportieren"
      icon={faDownload}
      onClick={onExport}
      dataTestId={
        dataTestIds?.export ?? `${dataTestIdPrefix}-export-geojson-btn`
      }
      visualOptions={visualOptions}
    />
    <AnnotationInfoBoxActionIcon
      title={hidden ? "Einblenden" : "Ausblenden"}
      icon={hidden ? faEyeSlash : faEye}
      onClick={onToggleVisibility}
      dataTestId={
        dataTestIds?.visibility ?? `${dataTestIdPrefix}-toggle-visibility-btn`
      }
      visualOptions={visualOptions}
    />
    {onSetReference ? (
      <AnnotationInfoBoxActionIcon
        title="Als Referenzhöhe setzen"
        icon={faArrowsDownToLine}
        onClick={onSetReference}
        dataTestId={
          dataTestIds?.reference ?? `${dataTestIdPrefix}-set-reference-btn`
        }
        visualOptions={visualOptions}
      />
    ) : null}
    <AnnotationInfoBoxActionIcon
      title={locked ? "Entsperren" : "Sperren"}
      icon={locked ? faLock : faLockOpen}
      onClick={onToggleLock}
      dataTestId={dataTestIds?.lock ?? `${dataTestIdPrefix}-toggle-lock-btn`}
      visualOptions={visualOptions}
    />
    <AnnotationInfoBoxActionIcon
      title={
        locked ? "Gesperrte Messung kann nicht gelöscht werden" : "Löschen"
      }
      icon={faTrashCan}
      onClick={onDelete}
      dataTestId={dataTestIds?.delete ?? `${dataTestIdPrefix}-delete-btn`}
      disabled={locked}
      visualOptions={visualOptions}
    />
  </div>
);
