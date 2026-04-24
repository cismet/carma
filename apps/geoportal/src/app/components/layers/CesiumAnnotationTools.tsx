import { useMemo } from "react";

import { Tooltip } from "antd";
import {
  faEye,
  faEyeSlash,
  faObjectGroup,
  faSearchLocation,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  areAnnotationEntriesHidden,
  flyToAnnotationIds,
  resolveAnnotationCountByToolType,
  resolveAnnotationEntriesByToolType,
  resolveAnnotationIdsByToolType,
  updateAnnotationEntryById,
  useAnnotationsDispatch,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";

import { CESIUM_ANNOTATION_CONFIG } from "../../config/app.config";
import { useGeoportalCesiumAnnotationToolPlugins } from "../../hooks/use-geoportal-cesium-annotation-tool-plugins";

const TOOLBAR_CLASS_NAMES = CESIUM_ANNOTATION_CONFIG.toolbar.classNames;

const CesiumAnnotationTools = () => {
  const dispatch = useAnnotationsDispatch();
  const {
    registry,
    activeToolType,
    requestModeChange,
    annotationEntries,
    flyToAllAnnotations,
    setSelectedAnnotationIds,
    nodes,
    scene,
    removeAnnotationById,
  } = useAnnotationsRuntime();
  const toolPlugins = useGeoportalCesiumAnnotationToolPlugins(registry.plugins);
  const annotationCountByToolType = useMemo(
    () => resolveAnnotationCountByToolType(annotationEntries),
    [annotationEntries]
  );
  const annotationIdsByToolType = useMemo(
    () => resolveAnnotationIdsByToolType(annotationEntries),
    [annotationEntries]
  );
  const annotationEntriesByToolType = useMemo(
    () => resolveAnnotationEntriesByToolType(annotationEntries),
    [annotationEntries]
  );

  return (
    <div
      className={TOOLBAR_CLASS_NAMES.wrapper}
      onClick={(event) => event.stopPropagation()}
    >
      {toolPlugins.map((plugin) => {
        const descriptor = plugin.descriptor;
        const isActive = descriptor.id === activeToolType;
        const isSelectionTool = descriptor.id === "select";
        const annotationCount = isSelectionTool
          ? annotationEntries.length
          : plugin.annotationType
          ? annotationCountByToolType.get(plugin.annotationType) ?? 0
          : 0;
        const annotationIds = isSelectionTool
          ? annotationEntries.map((annotationEntry) => annotationEntry.id)
          : plugin.annotationType
          ? annotationIdsByToolType.get(plugin.annotationType) ?? []
          : [];
        const annotationEntriesOfType = plugin.annotationType
          ? annotationEntriesByToolType.get(plugin.annotationType) ?? []
          : [];
        const areAllAnnotationsHidden = areAnnotationEntriesHidden(
          annotationEntriesOfType
        );

        return (
          <div key={descriptor.id} className={TOOLBAR_CLASS_NAMES.toolGroup}>
            <Tooltip title={descriptor.tooltip} placement="top">
              <div className={TOOLBAR_CLASS_NAMES.toolButtonShell}>
                {annotationCount > 0 ? (
                  <span className={TOOLBAR_CLASS_NAMES.toolButtonBadge}>
                    {annotationCount}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => requestModeChange(descriptor.id)}
                  aria-pressed={isActive}
                  aria-label={descriptor.tooltip}
                  className={[
                    TOOLBAR_CLASS_NAMES.toolButtonBase,
                    isActive
                      ? TOOLBAR_CLASS_NAMES.toolButtonActive
                      : TOOLBAR_CLASS_NAMES.toolButtonInactive,
                  ].join(" ")}
                >
                  <span className={TOOLBAR_CLASS_NAMES.toolButtonIcon}>
                    {descriptor.icon}
                  </span>
                </button>
              </div>
            </Tooltip>
            {isActive && annotationIds.length > 0 && (
              <div className={TOOLBAR_CLASS_NAMES.actionRow}>
                {isSelectionTool ? (
                  <>
                    <Tooltip
                      title="Alle Messungen auswählen"
                      placement="bottom"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAnnotationIds(annotationIds);
                        }}
                        aria-label="Alle Messungen auswählen"
                        className={TOOLBAR_CLASS_NAMES.smallActionButton}
                        disabled={annotationIds.length === 0}
                      >
                        <FontAwesomeIcon
                          icon={faObjectGroup}
                          className={TOOLBAR_CLASS_NAMES.toolButtonIcon}
                        />
                      </button>
                    </Tooltip>
                    <Tooltip
                      title="Alle Messungen fokussieren"
                      placement="bottom"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          flyToAllAnnotations();
                        }}
                        aria-label="Alle Messungen fokussieren"
                        className={TOOLBAR_CLASS_NAMES.smallActionButton}
                        disabled={annotationIds.length === 0}
                      >
                        <FontAwesomeIcon
                          icon={faSearchLocation}
                          className={TOOLBAR_CLASS_NAMES.toolButtonIcon}
                        />
                      </button>
                    </Tooltip>
                    <Tooltip title="Alle Messungen löschen" placement="bottom">
                      <button
                        type="button"
                        onClick={() => {
                          annotationIds.forEach((annotationId) => {
                            removeAnnotationById(annotationId);
                          });
                        }}
                        aria-label="Alle Messungen löschen"
                        className={TOOLBAR_CLASS_NAMES.smallActionButton}
                        disabled={annotationIds.length === 0}
                      >
                        <FontAwesomeIcon
                          icon={faTrashCan}
                          className={TOOLBAR_CLASS_NAMES.toolButtonIcon}
                        />
                      </button>
                    </Tooltip>
                  </>
                ) : (
                  <>
                    <Tooltip
                      title={`${descriptor.label} fokussieren`}
                      placement="bottom"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          flyToAnnotationIds({
                            annotationIds,
                            annotationEntries,
                            nodes,
                            scene,
                          })
                        }
                        aria-label={`${descriptor.label} fokussieren`}
                        className={TOOLBAR_CLASS_NAMES.smallActionButton}
                        disabled={annotationIds.length === 0}
                      >
                        <FontAwesomeIcon
                          icon={faSearchLocation}
                          className={TOOLBAR_CLASS_NAMES.toolButtonIcon}
                        />
                      </button>
                    </Tooltip>
                    <Tooltip
                      title={
                        areAllAnnotationsHidden
                          ? `${descriptor.label} einblenden`
                          : `${descriptor.label} ausblenden`
                      }
                      placement="bottom"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          annotationIds.forEach((annotationId) => {
                            dispatch(
                              updateAnnotationEntryById({
                                annotationId,
                                hidden: !areAllAnnotationsHidden,
                              })
                            );
                          });
                        }}
                        aria-label={`${descriptor.label} Sichtbarkeit umschalten`}
                        className={TOOLBAR_CLASS_NAMES.smallActionButton}
                        disabled={annotationIds.length === 0}
                      >
                        <FontAwesomeIcon
                          icon={areAllAnnotationsHidden ? faEyeSlash : faEye}
                          className={TOOLBAR_CLASS_NAMES.toolButtonIcon}
                        />
                      </button>
                    </Tooltip>
                    <Tooltip
                      title={`${descriptor.label} löschen`}
                      placement="bottom"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          annotationIds.forEach((annotationId) => {
                            removeAnnotationById(annotationId);
                          });
                        }}
                        aria-label={`${descriptor.label} löschen`}
                        className={TOOLBAR_CLASS_NAMES.smallActionButton}
                        disabled={annotationIds.length === 0}
                      >
                        <FontAwesomeIcon
                          icon={faTrashCan}
                          className={TOOLBAR_CLASS_NAMES.toolButtonIcon}
                        />
                      </button>
                    </Tooltip>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CesiumAnnotationTools;
