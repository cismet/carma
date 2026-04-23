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
  ANNOTATION_TOOL_PLUGIN_KINDS,
  updateAnnotationEntryById,
  useAnnotationsDispatch,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
import { BoundingSphere, Cartesian3 } from "@carma-cesium";
import { flyToBoundingSphereExtent } from "@carma-mapping/engines/cesium/core";

const TOOLBAR_WRAPPER_CLASSNAME =
  "w-fit max-w-full flex items-start gap-2 overflow-visible px-1 pt-1 pb-10";

const TOOL_BUTTON_BASE_CLASSNAME =
  "flex h-8 w-12 min-w-12 items-center justify-center rounded-[10px] bg-white px-2 text-gray-700 button-shadow transition-colors hover:text-gray-900";

const TOOL_BUTTON_ACTIVE_CLASSNAME =
  "text-[#1677ff]";

const TOOL_BUTTON_INACTIVE_CLASSNAME = "";

const TOOL_GROUP_CLASSNAME =
  "relative flex w-12 min-w-12 flex-col items-center overflow-visible";

const TOOL_ACTION_ROW_CLASSNAME =
  "absolute left-1/2 top-full z-10 mt-3 flex h-8 w-max -translate-x-1/2 items-center gap-1 rounded-[10px] bg-white px-1 button-shadow";

const SMALL_ACTION_BUTTON_CLASSNAME =
  "flex h-8 w-8 min-w-8 items-center justify-center rounded-[10px] text-gray-600 transition-colors hover:text-gray-900";

const TOOL_BUTTON_ICON_CLASSNAME =
  "inline-flex items-center justify-center text-base leading-none";

const TOOL_BUTTON_BADGE_CLASSNAME =
  "absolute right-0 top-0 z-10 inline-flex h-5 min-w-5 translate-x-1/3 -translate-y-1/3 items-center justify-center rounded-full bg-[#4b5563] px-1 text-[12px] font-medium leading-none text-white shadow-sm";

const resolveAnnotationCountByToolType = (
  annotationEntries: ReturnType<
    typeof useAnnotationsRuntime
  >["annotationEntries"]
) => {
  const countByToolType = new Map<string, number>();

  annotationEntries.forEach((annotationEntry) => {
    countByToolType.set(
      annotationEntry.toolType,
      (countByToolType.get(annotationEntry.toolType) ?? 0) + 1
    );
  });

  return countByToolType;
};

const resolveAnnotationIdsByToolType = (
  annotationEntries: ReturnType<
    typeof useAnnotationsRuntime
  >["annotationEntries"]
) => {
  const idsByToolType = new Map<string, string[]>();

  annotationEntries.forEach((annotationEntry) => {
    const currentIds = idsByToolType.get(annotationEntry.toolType) ?? [];
    currentIds.push(annotationEntry.id);
    idsByToolType.set(annotationEntry.toolType, currentIds);
  });

  return idsByToolType;
};

const resolveNodeCoordinatesById = (
  nodes: ReturnType<typeof useAnnotationsRuntime>["nodes"]
) => new Map(nodes.map((node) => [node.id, node.coordinate] as const));

const flyToToolTypeAnnotations = ({
  annotationIds,
  annotationEntries,
  coordinateByNodeId,
  scene,
}: {
  annotationIds: readonly string[];
  annotationEntries: ReturnType<
    typeof useAnnotationsRuntime
  >["annotationEntries"];
  coordinateByNodeId: Map<
    string,
    ReturnType<typeof useAnnotationsRuntime>["nodes"][number]["coordinate"]
  >;
  scene: ReturnType<typeof useAnnotationsRuntime>["scene"];
}) => {
  if (!scene || scene.isDestroyed() || annotationIds.length === 0) {
    return;
  }

  const entryById = new Map(
    annotationEntries.map(
      (annotationEntry) => [annotationEntry.id, annotationEntry] as const
    )
  );
  const points = annotationIds.flatMap((annotationId) => {
    const annotationEntry = entryById.get(annotationId);
    if (!annotationEntry) {
      return [];
    }

    return annotationEntry.nodeIds.flatMap((nodeId) => {
      const coordinate = coordinateByNodeId.get(nodeId);
      if (!coordinate) {
        return [];
      }

      return [
        Cartesian3.fromDegrees(
          coordinate.longitude,
          coordinate.latitude,
          coordinate.altitude
        ),
      ];
    });
  });

  if (points.length === 0) {
    return;
  }

  const sphere = BoundingSphere.fromPoints(points);
  sphere.radius = Math.max(sphere.radius, 25);
  flyToBoundingSphereExtent(scene.camera, sphere, {
    minRange: 25,
    paddingFactor: 1.4,
  });
};

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
  const toolPlugins = useMemo(
    () =>
      registry.plugins
        .filter(
          (plugin) =>
            plugin.id === "select" ||
            (plugin.kind === ANNOTATION_TOOL_PLUGIN_KINDS.MEASUREMENT &&
              plugin.annotationType)
        )
        .sort((left, right) => left.descriptor.order - right.descriptor.order),
    [registry.plugins]
  );
  const annotationCountByToolType = useMemo(
    () => resolveAnnotationCountByToolType(annotationEntries),
    [annotationEntries]
  );
  const annotationIdsByToolType = useMemo(
    () => resolveAnnotationIdsByToolType(annotationEntries),
    [annotationEntries]
  );
  const coordinateByNodeId = useMemo(
    () => resolveNodeCoordinatesById(nodes),
    [nodes]
  );

  return (
    <div
      className={TOOLBAR_WRAPPER_CLASSNAME}
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
          ? annotationEntries.filter(
              (annotationEntry) =>
                annotationEntry.toolType === plugin.annotationType
            )
          : [];
        const areAllAnnotationsHidden =
          annotationEntriesOfType.length > 0 &&
          annotationEntriesOfType.every(
            (annotationEntry) => annotationEntry.hidden
          );

        return (
          <div key={descriptor.id} className={TOOL_GROUP_CLASSNAME}>
            <Tooltip title={descriptor.tooltip} placement="top">
              <div className="relative overflow-visible pt-1">
                {annotationCount > 0 ? (
                  <span className={TOOL_BUTTON_BADGE_CLASSNAME}>
                    {annotationCount}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => requestModeChange(descriptor.id)}
                  aria-pressed={isActive}
                  aria-label={descriptor.tooltip}
                  className={[
                    TOOL_BUTTON_BASE_CLASSNAME,
                    isActive
                      ? TOOL_BUTTON_ACTIVE_CLASSNAME
                      : TOOL_BUTTON_INACTIVE_CLASSNAME,
                  ].join(" ")}
                >
                  <span className={TOOL_BUTTON_ICON_CLASSNAME}>
                    {descriptor.icon}
                  </span>
                </button>
              </div>
            </Tooltip>
            {isActive && annotationIds.length > 0 && (
              <div className={TOOL_ACTION_ROW_CLASSNAME}>
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
                        className={SMALL_ACTION_BUTTON_CLASSNAME}
                        disabled={annotationIds.length === 0}
                      >
                        <FontAwesomeIcon
                          icon={faObjectGroup}
                          className={TOOL_BUTTON_ICON_CLASSNAME}
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
                        className={SMALL_ACTION_BUTTON_CLASSNAME}
                        disabled={annotationIds.length === 0}
                      >
                        <FontAwesomeIcon
                          icon={faSearchLocation}
                          className={TOOL_BUTTON_ICON_CLASSNAME}
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
                        className={SMALL_ACTION_BUTTON_CLASSNAME}
                        disabled={annotationIds.length === 0}
                      >
                        <FontAwesomeIcon
                          icon={faTrashCan}
                          className={TOOL_BUTTON_ICON_CLASSNAME}
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
                          flyToToolTypeAnnotations({
                            annotationIds,
                            annotationEntries,
                            coordinateByNodeId,
                            scene,
                          })
                        }
                        aria-label={`${descriptor.label} fokussieren`}
                        className={SMALL_ACTION_BUTTON_CLASSNAME}
                        disabled={annotationIds.length === 0}
                      >
                        <FontAwesomeIcon
                          icon={faSearchLocation}
                          className={TOOL_BUTTON_ICON_CLASSNAME}
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
                        className={SMALL_ACTION_BUTTON_CLASSNAME}
                        disabled={annotationIds.length === 0}
                      >
                        <FontAwesomeIcon
                          icon={areAllAnnotationsHidden ? faEyeSlash : faEye}
                          className={TOOL_BUTTON_ICON_CLASSNAME}
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
                        className={SMALL_ACTION_BUTTON_CLASSNAME}
                        disabled={annotationIds.length === 0}
                      >
                        <FontAwesomeIcon
                          icon={faTrashCan}
                          className={TOOL_BUTTON_ICON_CLASSNAME}
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
