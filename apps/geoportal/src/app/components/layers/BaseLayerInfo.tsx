import { DndContext } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Tabs } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { layerMap } from "../../config";
import {
  findBackgroundCategory,
  getBackgroundCategoryTitle,
  getLibre3dOption,
} from "../../config/backgroundConfig";
import {
  changeVisibility,
  getBackgroundLayer,
  getLayerStack,
  getSelected3dByCategory,
  getSelectedBackgroundEntry,
  setLayers,
} from "../../store/slices/mapping";
import LayerRow from "./LayerRow";
import "./text.css";
import LayerInfoWrapper from "./LayerInfoWrapper";
import { filter3dLayers } from "../../helper/adhoc-feature-utils";
import { useIsAdhocLayerListed } from "../../hooks/use-is-adhoc-layer-listed";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faX } from "@fortawesome/free-solid-svg-icons";
import { useCallback, useState } from "react";
import { getLayerVisibilityToggleProps } from "./layer-visibility-toggle-props";
import type { AppDispatch } from "../../store";
import { isLayerGroup } from "@carma-mapping/layers";
import type { BackgroundLayer, LayerStackEntry } from "@carma-mapping/layers";
import { useIs3dView } from "../../hooks/useIs3dView";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

const BaseLayerInfo = () => {
  const [activeTab, setActiveTab] = useState("1");
  const dispatch: AppDispatch = useDispatch();

  const selectedEntry = useSelector(getSelectedBackgroundEntry);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const layers = useSelector(getLayerStack);
  const is3dView = useIs3dView();
  // only Cesium cannot draw the 2D layers; the maplibre 3D view lists them all
  const { isCesium } = useMapFrameworkSwitcherContext();
  const isAdhocLayerListed = useIsAdhocLayerListed();
  const category = findBackgroundCategory(backgroundLayer.id);
  const selected3d = useSelector(getSelected3dByCategory)[backgroundLayer.id];
  const description3d =
    (!isCesium && getLibre3dOption(category, selected3d)?.description3d) ||
    category?.description3d;

  const isListed = (entry: LayerStackEntry): boolean =>
    isLayerGroup(entry)
      ? entry.layers.some(isListed)
      : isAdhocLayerListed(entry) &&
        (isCesium ? !!filter3dLayers(entry) : true);

  const filteredLayers = layers.filter(isListed);
  const isPinnedAs = (entry: LayerStackEntry, pinned: "first" | "last") =>
    !isLayerGroup(entry) && entry.pinned === pinned;
  const reversedLayers = filteredLayers.slice().reverse();
  const sortableLayers = reversedLayers.filter(
    (entry) => isLayerGroup(entry) || !entry.pinned
  );
  const pinnedFirstLayers = filteredLayers.filter((l) =>
    isPinnedAs(l, "first")
  );
  const pinnedLastLayers = filteredLayers.filter((l) => isPinnedAs(l, "last"));

  const getLayerPos = (id) => layers.findIndex((layer) => layer.id === id);
  const handleLayerVisibilityChange = useCallback(
    (layerId: string, visible: boolean) => {
      dispatch(changeVisibility({ id: layerId, visible }));
    },
    [dispatch]
  );
  const resolveLayerVisibilityToggleProps = (
    layer: BackgroundLayer | LayerStackEntry
  ) =>
    getLayerVisibilityToggleProps({
      // only Cesium limits the toggles; the maplibre 3D view keeps the 2D ones
      is3d: isCesium,
      layer,
      onChangeLayerVisibility: handleLayerVisibilityChange,
    });

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const originalPos = getLayerPos(active.id);
      const newPos = getLayerPos(over.id);
      const newLayers = arrayMove(layers, originalPos, newPos);

      dispatch(setLayers(newLayers));
    }
  };

  const removeAllLayersButton = (
    <button
      onClick={() => dispatch(setLayers([]))}
      className="text-gray-600 hover:text-gray-500 p-2 whitespace-nowrap"
    >
      Alle Karteninhalte entfernen
      <FontAwesomeIcon icon={faX} className="ml-2" />
    </button>
  );

  const getBackgroundDescription = () => {
    if (is3dView) {
      return category ? getBackgroundCategoryTitle(category, false) : "";
    }
    return selectedEntry ? layerMap[selectedEntry.id]?.description : "";
  };

  return (
    <LayerInfoWrapper
      content={
        <>
          <hr className="h-px my-0 bg-gray-300 border-0 w-full" />

          <div className="flex flex-col h-full overflow-auto gap-2">
            <Tabs
              animated={false}
              activeKey={activeTab}
              onChange={setActiveTab}
              className="full-width-tabs"
              tabBarExtraContent={{
                right:
                  activeTab === "1" ? (
                    <div className="hidden sm:flex items-center gap-3">
                      {removeAllLayersButton}
                    </div>
                  ) : null,
              }}
              items={[
                {
                  key: "1",
                  label: "Kartenebenen",
                  children: (
                    <>
                      <div className="flex sm:hidden items-center justify-end">
                        {removeAllLayersButton}
                      </div>
                      <DndContext
                        onDragEnd={handleDragEnd}
                        modifiers={[restrictToVerticalAxis]}
                      >
                        <div className="h-full overflow-auto max-h-full flex flex-col gap-2 pr-1">
                          {pinnedLastLayers
                            .slice()
                            .reverse()
                            .map((layer) => (
                              <LayerRow
                                key={`layer.${layer.id}`}
                                layer={layer}
                                id={layer.id}
                                index={layers.indexOf(layer)}
                                {...resolveLayerVisibilityToggleProps(layer)}
                              />
                            ))}
                          <SortableContext
                            items={sortableLayers}
                            strategy={verticalListSortingStrategy}
                          >
                            {sortableLayers.map((layer) => (
                              <LayerRow
                                key={`layer.${layer.id}`}
                                layer={layer}
                                id={layer.id}
                                index={layers.indexOf(layer)}
                                {...resolveLayerVisibilityToggleProps(layer)}
                              />
                            ))}
                          </SortableContext>
                          {pinnedFirstLayers.map((layer) => (
                            <LayerRow
                              key={`layer.${layer.id}`}
                              layer={layer}
                              id={layer.id}
                              index={layers.indexOf(layer)}
                              {...resolveLayerVisibilityToggleProps(layer)}
                            />
                          ))}
                          <LayerRow
                            isBackgroundLayer
                            layer={backgroundLayer}
                            id={backgroundLayer.id}
                            displayTitle={
                              is3dView && category
                                ? getBackgroundCategoryTitle(category, false)
                                : backgroundLayer.title
                            }
                            index={-1}
                            {...resolveLayerVisibilityToggleProps(
                              backgroundLayer
                            )}
                          />
                        </div>
                      </DndContext>
                    </>
                  ),
                },
                {
                  key: "2",
                  label: "Informationen",
                  children: (
                    <div className="h-full overflow-auto flex flex-col">
                      <>
                        <h5 className="font-semibold text-lg mb-1">
                          {is3dView ? "Hintergrundmodell" : "Hintergrundkarte"}:
                          Eignung
                        </h5>
                        <div
                          className="text-base"
                          dangerouslySetInnerHTML={{
                            __html: is3dView
                              ? description3d?.eignung
                              : backgroundLayer.eignung,
                          }}
                        />
                        <h5 className="font-semibold text-lg mb-1 mt-2">
                          {is3dView ? "Hintergrundmodell" : "Hintergrundkarte"}:
                          Inhalt
                        </h5>
                        <div
                          className="text-base"
                          dangerouslySetInnerHTML={{
                            __html: is3dView
                              ? description3d?.inhalt
                              : backgroundLayer.inhalt,
                          }}
                        />
                      </>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </>
      }
      footerText={`Aktuell: ${getBackgroundDescription()}`}
    />
  );
};

export default BaseLayerInfo;
