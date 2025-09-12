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
  getBackgroundLayer,
  getLayers,
  getSelectedLuftbildLayer,
  getSelectedMapLayer,
  setLayers,
} from "../../store/slices/mapping";
import LayerRow from "./LayerRow";
import "./text.css";
import LayerInfoWrapper from "./LayerInfoWrapper";

const BaseLayerInfo = () => {
  const dispatch = useDispatch();

  const selectedMapLayer = useSelector(getSelectedMapLayer);
  const selectedLuftbildLayer = useSelector(getSelectedLuftbildLayer);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const layers = useSelector(getLayers);

  const reversedLayers = layers
    .slice()
    .reverse()
    .map((element, index) => {
      return element;
    });

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
    if (backgroundLayer.id === "karte") {
      return layerMap[selectedMapLayer.id].description;
    } else {
      return layerMap[selectedLuftbildLayer.id].description;
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
              items={[
                {
                  key: "1",
                  label: "Kartenebenen",
                  children: (
                    <DndContext
                      onDragEnd={handleDragEnd}
                      modifiers={[restrictToVerticalAxis]}
                    >
                      <div className="h-full overflow-auto max-h-full flex flex-col gap-2">
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
                      <h5 className="font-semibold text-lg mb-1">Eignung</h5>
                      <div
                        className="text-base"
                        dangerouslySetInnerHTML={{
                          __html: backgroundLayer.eignung,
                        }}
                      />
                      <h5 className="font-semibold text-lg mb-1 mt-2">
                        Inhalt
                      </h5>
                      <div
                        className="text-base"
                        dangerouslySetInnerHTML={{
                          __html: backgroundLayer.inhalt,
                        }}
                      />
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
