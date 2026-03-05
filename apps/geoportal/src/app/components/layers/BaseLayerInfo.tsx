import { DndContext } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Tabs } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { cesiumDescriptions, layerMap } from "../../config";
import {
  getBackgroundLayer,
  getLayers,
  getSelectedLuftbildLayer,
  getSelectedMapLayer,
  setLayers,
} from "../../store/slices/mapping";
import LayerRow from "./LayerRow";
import "./text.css";
import LayerInfoWrapper from "./LayerInfoWrapper";
import { filter3dLayers } from "../../helper/adhoc-feature-utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faX } from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

const BaseLayerInfo = () => {
  const [activeTab, setActiveTab] = useState("1");
  const dispatch = useDispatch();

  const selectedMapLayer = useSelector(getSelectedMapLayer);
  const selectedLuftbildLayer = useSelector(getSelectedLuftbildLayer);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const layers = useSelector(getLayers);
  const { isCesium } = useMapFrameworkSwitcherContext();

  const reversedLayers = layers
    .slice()
    .reverse()
    .filter((layer) => (isCesium ? filter3dLayers(layer) : true));

  const getLayerPos = (id) => layers.findIndex((layer) => layer.id === id);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const originalPos = getLayerPos(active.id);
      const newPos = getLayerPos(over.id);
      const newLayers = arrayMove(layers, originalPos, newPos);

      dispatch(setLayers(newLayers));
    }
  };

  const getBackgroundDescription = () => {
    const { isCesium } = useMapFrameworkSwitcherContext();
    if (backgroundLayer.id === "karte") {
      return isCesium
        ? "LoD2-Gebäudemodell"
        : layerMap[selectedMapLayer.id].description;
    } else {
      return isCesium
        ? "3D-Mesh"
        : layerMap[selectedLuftbildLayer.id].description;
    }
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
              tabBarExtraContent={{
                right:
                  activeTab === "1" ? (
                    <button
                      onClick={() => dispatch(setLayers([]))}
                      className="text-gray-600 hover:text-gray-500 p-2"
                    >
                      Alle Karteninhalte entfernen
                      <FontAwesomeIcon icon={faX} className="ml-2" />
                    </button>
                  ) : null,
              }}
              items={[
                {
                  key: "1",
                  label: "Kartenebenen",
                  children: (
                    <DndContext
                      onDragEnd={handleDragEnd}
                      modifiers={[restrictToVerticalAxis]}
                    >
                      <div className="h-full overflow-auto max-h-full flex flex-col gap-2 pr-1">
                        <SortableContext
                          items={layers}
                          strategy={verticalListSortingStrategy}
                        >
                          {reversedLayers.map((layer, i) => (
                            <LayerRow
                              key={`layer.${i}`}
                              layer={layer}
                              id={layer.id}
                              index={reversedLayers.length - 1 - i}
                            />
                          ))}
                        </SortableContext>
                        <LayerRow
                          isBackgroundLayer
                          layer={backgroundLayer}
                          id={backgroundLayer.id}
                          index={-1}
                        />
                      </div>
                    </DndContext>
                  ),
                },
                {
                  key: "2",
                  label: "Informationen",
                  children: (
                    <div className="h-full overflow-auto flex flex-col">
                      <>
                        <h5 className="font-semibold text-lg mb-1">
                          {isCesium ? "Hintergrundmodell" : "Hintergrundkarte"}:
                          Eignung
                        </h5>
                        <div
                          className="text-base"
                          dangerouslySetInnerHTML={{
                            __html: isCesium
                              ? cesiumDescriptions[backgroundLayer.id]?.eignung
                              : backgroundLayer.eignung,
                          }}
                        />
                        <h5 className="font-semibold text-lg mb-1 mt-2">
                          {isCesium ? "Hintergrundmodell" : "Hintergrundkarte"}:
                          Inhalt
                        </h5>
                        <div
                          className="text-base"
                          dangerouslySetInnerHTML={{
                            __html: isCesium
                              ? cesiumDescriptions[backgroundLayer.id]?.inhalt
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
