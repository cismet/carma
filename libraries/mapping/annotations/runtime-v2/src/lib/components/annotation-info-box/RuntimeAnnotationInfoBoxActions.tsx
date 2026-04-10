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

import { RuntimeAnnotationInfoBoxActionIcon } from "./RuntimeAnnotationInfoBoxActionIcon";
import type { RuntimeAnnotationInfoBoxVisualOptions } from "./annotationInfoBoxVisualDefaults";

type RuntimeAnnotationInfoBoxActionsProps = {
  hidden?: boolean;
  locked?: boolean;
  onFlyTo: RuntimeAnnotationInfoBoxActionHandler;
  onExport: RuntimeAnnotationInfoBoxActionHandler;
  onToggleVisibility: RuntimeAnnotationInfoBoxActionHandler;
  onToggleLock: RuntimeAnnotationInfoBoxActionHandler;
  onDelete: RuntimeAnnotationInfoBoxActionHandler;
  onSetReference?: RuntimeAnnotationInfoBoxActionHandler;
  visualOptions?: RuntimeAnnotationInfoBoxVisualOptions;
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

type RuntimeAnnotationInfoBoxActionHandler = (
  event: ReactMouseEvent<SVGSVGElement, MouseEvent>
) => void;

export const RuntimeAnnotationInfoBoxActions = ({
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
}: RuntimeAnnotationInfoBoxActionsProps) => (
  <div className="flex items-center gap-2">
    <RuntimeAnnotationInfoBoxActionIcon
      title="Zur Messung fliegen"
      icon={faSearchLocation}
      onClick={onFlyTo}
      dataTestId={dataTestIds?.flyTo ?? `${dataTestIdPrefix}-flyto-btn`}
      visualOptions={visualOptions}
    />
    <RuntimeAnnotationInfoBoxActionIcon
      title="Als GeoJSON exportieren"
      icon={faDownload}
      onClick={onExport}
      dataTestId={
        dataTestIds?.export ?? `${dataTestIdPrefix}-export-geojson-btn`
      }
      visualOptions={visualOptions}
    />
    <RuntimeAnnotationInfoBoxActionIcon
      title={hidden ? "Einblenden" : "Ausblenden"}
      icon={hidden ? faEyeSlash : faEye}
      onClick={onToggleVisibility}
      dataTestId={
        dataTestIds?.visibility ?? `${dataTestIdPrefix}-toggle-visibility-btn`
      }
      visualOptions={visualOptions}
    />
    {onSetReference ? (
      <RuntimeAnnotationInfoBoxActionIcon
        title="Als Referenzhöhe setzen"
        icon={faArrowsDownToLine}
        onClick={onSetReference}
        dataTestId={
          dataTestIds?.reference ?? `${dataTestIdPrefix}-set-reference-btn`
        }
        visualOptions={visualOptions}
      />
    ) : null}
    <RuntimeAnnotationInfoBoxActionIcon
      title={locked ? "Entsperren" : "Sperren"}
      icon={locked ? faLock : faLockOpen}
      onClick={onToggleLock}
      dataTestId={dataTestIds?.lock ?? `${dataTestIdPrefix}-toggle-lock-btn`}
      visualOptions={visualOptions}
    />
    <RuntimeAnnotationInfoBoxActionIcon
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
import type { MouseEvent as ReactMouseEvent } from "react";
