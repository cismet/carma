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
    <div className="flex flex-col gap-1 overflow-y-hidden h-full">
      <hr className="h-px my-0 bg-gray-300 border-0 w-full" />

      <div className="flex flex-col h-full overflow-auto gap-2">
        <Tabs
          animated={false}
          items={[
            {
              key: "1",
              label: "Eignung",
              children: (
                <div className="h-full overflow-auto">
                  <div
                    className="text-base"
                    dangerouslySetInnerHTML={{
                      __html: backgroundLayer.eignung,
                    }}
                  />
                </div>
              ),
            },
            {
              key: "2",
              label: "Inhalt",
              children: (
                <div className="h-full overflow-auto">
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
        <h5 className="font-semibold text-lg">Kartenebenen:</h5>
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
      </div>
      <hr className="h-px my-0 bg-gray-300 border-0 w-full absolute bottom-9 left-0" />
      <p className="my-0 pt-2.5 text-gray-400 text-base truncate">
        Aktuell: {getBackgroundDescription()}
      </p>
    </div>
  );
};

export default BaseLayerInfo;
