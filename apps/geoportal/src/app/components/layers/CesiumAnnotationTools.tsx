import { useMemo } from "react";

import { Tooltip } from "antd";
import {
  faObjectGroup,
  faSearchLocation,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  resolveAnnotationCountByToolType,
  resolveAnnotationIdsByToolType,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";

import { CESIUM_ANNOTATION_CONFIG } from "../../config/app.config";
import { useGeoportalCesiumAnnotationToolPlugins } from "../../hooks/use-geoportal-cesium-annotation-tool-plugins";

const TOOLBAR_CLASS_NAMES = CESIUM_ANNOTATION_CONFIG.toolbar.classNames;
const TOOLBAR_METRICS = CESIUM_ANNOTATION_CONFIG.toolbar.metrics;
const SELECTION_ACTION_GROUP_COLLAPSED_WIDTH_PX =
  TOOLBAR_METRICS.toolButtonWidthPx;
const SELECTION_ACTION_GROUP_EXPANDED_WIDTH_PX =
  TOOLBAR_METRICS.toolButtonWidthPx +
  TOOLBAR_METRICS.smallActionButtonWidthPx *
    TOOLBAR_METRICS.selectionActionButtonCount;

const CesiumAnnotationTools = () => {
  const {
    registry,
    activeToolType,
    requestModeChange,
    annotationEntries,
    flyToAllAnnotations,
    setSelectedAnnotationIds,
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
        const hasToolActions =
          isSelectionTool && isActive && annotationIds.length > 0;
        const usesSelectionActionGroup = isSelectionTool && isActive;
        const actionGroupWidthPx = hasToolActions
          ? SELECTION_ACTION_GROUP_EXPANDED_WIDTH_PX
          : SELECTION_ACTION_GROUP_COLLAPSED_WIDTH_PX;

        return (
          <div key={descriptor.id} className={TOOLBAR_CLASS_NAMES.toolGroup}>
            <div className={TOOLBAR_CLASS_NAMES.toolButtonShell}>
              {annotationCount > 0 ? (
                <span className={TOOLBAR_CLASS_NAMES.toolButtonBadge}>
                  {annotationCount}
                </span>
              ) : null}
              {usesSelectionActionGroup ? (
                <div
                  className={TOOLBAR_CLASS_NAMES.actionGroup}
                  role={hasToolActions ? "group" : undefined}
                  aria-label={
                    hasToolActions ? `${descriptor.label} Aktionen` : undefined
                  }
                  style={{
                    width: actionGroupWidthPx,
                    transitionDuration: `${TOOLBAR_METRICS.actionGroupWidthTransitionMs}ms`,
                    willChange: "width",
                  }}
                >
                  <Tooltip title={descriptor.tooltip} placement="top">
                    <button
                      type="button"
                      onClick={() => requestModeChange(descriptor.id)}
                      aria-pressed={isActive}
                      aria-label={descriptor.tooltip}
                      className={[
                        TOOLBAR_CLASS_NAMES.toolButtonPrimaryAction,
                        TOOLBAR_CLASS_NAMES.toolButtonActive,
                      ].join(" ")}
                    >
                      <span className={TOOLBAR_CLASS_NAMES.toolButtonIcon}>
                        {descriptor.icon}
                      </span>
                    </button>
                  </Tooltip>
                  {hasToolActions ? (
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
                        >
                          <FontAwesomeIcon
                            icon={faSearchLocation}
                            className={TOOLBAR_CLASS_NAMES.toolButtonIcon}
                          />
                        </button>
                      </Tooltip>
                      <Tooltip
                        title="Alle Messungen löschen"
                        placement="bottom"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            annotationIds.forEach((annotationId) => {
                              removeAnnotationById(annotationId);
                            });
                          }}
                          aria-label="Alle Messungen löschen"
                          className={TOOLBAR_CLASS_NAMES.smallActionButton}
                        >
                          <FontAwesomeIcon
                            icon={faTrashCan}
                            className={TOOLBAR_CLASS_NAMES.toolButtonIcon}
                          />
                        </button>
                      </Tooltip>
                    </>
                  ) : null}
                </div>
              ) : (
                <Tooltip title={descriptor.tooltip} placement="top">
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
                </Tooltip>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CesiumAnnotationTools;
