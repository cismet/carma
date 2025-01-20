import { useDispatch, useSelector } from "react-redux";
import {
  getBackgroundLayer,
  getLayers,
  getSelectedLuftbildLayer,
  getSelectedMapLayer,
  setBackgroundLayer,
  setLayers,
  setSelectedLuftbildLayer,
  setSelectedMapLayer,
} from "../../store/slices/mapping";
import { cn } from "../../helper/helper";
import { Radio, Tabs } from "antd";
import { layerMap } from "../../config";
import { DndContext } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
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

  const handleRadioClick = (radioValue: string) => {
    if (
      backgroundLayer.id === "luftbild" &&
      selectedMapLayer.id === radioValue
    ) {
      dispatch(setBackgroundLayer({ ...selectedMapLayer, id: "karte" }));
    }
  };

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
      return layerMap[backgroundLayer.id].description;
    }
  };

  return (
    <div className="flex flex-col gap-1 overflow-y-hidden h-full">
      <div className="flex flex-col gap-2 pb-4">
        <div className="w-full flex last:rounded-s-md first:rounded-s-md">
          <button
            onClick={(e) => {
              if (
                (e.target as HTMLElement).localName !== "span" &&
                (e.target as HTMLElement).localName !== "input"
              ) {
                dispatch(
                  setBackgroundLayer({ ...selectedMapLayer, id: "karte" })
                );
              }
            }}
            className={cn(
              "w-full group border-[1px] rounded-s-md",
              backgroundLayer.id !== "luftbild" && "border-[#1677ff]"
            )}
          >
            <div className="w-full flex flex-col text-[14px]/[30px] items-center justify-center gap-3">
              <p
                className={cn(
                  "mb-0 group-hover:text-[#1677ff]",
                  backgroundLayer.id !== "luftbild" && "text-[#1677ff]"
                )}
              >
                Karte
              </p>
              <Radio.Group
                value={selectedMapLayer.id}
                onChange={(e) => {
                  dispatch(
                    setSelectedMapLayer({
                      id: e.target.value,
                      title: layerMap[e.target.value].title,
                      opacity: 1.0,
                      description: layerMap[e.target.value].description,
                      inhalt: layerMap[e.target.value].inhalt,
                      eignung: layerMap[e.target.value].eignung,
                      layerType: "wmts",
                      visible: true,
                      props: {
                        name: "",
                        url: layerMap[e.target.value].url,
                      },
                      layers: layerMap[e.target.value].layers,
                    })
                  );

                  dispatch(
                    setBackgroundLayer({
                      id: "karte",
                      title: layerMap[e.target.value].title,
                      opacity: 1.0,
                      description: layerMap[e.target.value].description,
                      inhalt: layerMap[e.target.value].inhalt,
                      eignung: layerMap[e.target.value].eignung,
                      layerType: "wmts",
                      visible: true,
                      props: {
                        name: "",
                        url: layerMap[e.target.value].url,
                      },
                      layers: layerMap[e.target.value].layers,
                    })
                  );
                }}
                className="pb-2"
                optionType="default"
              >
                <Radio
                  onClick={(e) => {
                    handleRadioClick((e.target as HTMLInputElement).value);
                  }}
                  value="stadtplan"
                >
                  Stadtplan
                </Radio>
                <Radio
                  onClick={(e) => {
                    handleRadioClick((e.target as HTMLInputElement).value);
                  }}
                  value="gelaende"
                >
                  Gelände
                </Radio>
                <Radio
                  onClick={(e) => {
                    handleRadioClick((e.target as HTMLInputElement).value);
                  }}
                  value="amtlich"
                >
                  Amtliche Geobasisdaten
                </Radio>
              </Radio.Group>
            </div>
          </button>
          <button
            onClick={(e) => {
              if (
                (e.target as HTMLElement).localName !== "span" &&
                (e.target as HTMLElement).localName !== "input"
              ) {
                dispatch(
                  setBackgroundLayer({
                    ...selectedLuftbildLayer,
                    id: "luftbild",
                  })
                );
              }
            }}
            className={cn(
              "w-full group rounded-e-md border-[1px]",
              backgroundLayer.id === "luftbild" && "border-[#1677ff]"
            )}
          >
            <div className="w-full flex flex-col text-[14px]/[30px] items-center justify-center gap-3">
              <p
                className={cn(
                  "mb-0 group-hover:text-[#1677ff]",
                  backgroundLayer.id === "luftbild" && "text-[#1677ff]"
                )}
              >
                Luftbild
              </p>
              <Radio.Group
                value={selectedLuftbildLayer.id}
                onChange={(e) => {
                  dispatch(
                    setSelectedLuftbildLayer({
                      id: e.target.value,
                      title: layerMap[e.target.value].title,
                      opacity: 1.0,
                      description: layerMap[e.target.value].description,
                      inhalt: layerMap[e.target.value].inhalt,
                      eignung: layerMap[e.target.value].eignung,
                      layerType: "wmts",
                      visible: true,
                      props: {
                        name: "",
                        url: layerMap[e.target.value].url,
                      },
                      layers: layerMap[e.target.value].layers,
                    })
                  );

                  dispatch(
                    setBackgroundLayer({
                      id: "luftbild",
                      title: layerMap[e.target.value].title,
                      opacity: 1.0,
                      description: layerMap[e.target.value].description,
                      inhalt: layerMap[e.target.value].inhalt,
                      eignung: layerMap[e.target.value].eignung,
                      layerType: "wmts",
                      visible: true,
                      props: {
                        name: "",
                        url: layerMap[e.target.value].url,
                      },
                      layers: layerMap[e.target.value].layers,
                    })
                  );
                }}
                className="pb-2"
                optionType="default"
              >
                <Radio
                  onClick={(e) => {
                    handleRadioClick((e.target as HTMLInputElement).value);
                  }}
                  value="luftbild"
                >
                  Luftbildkarte 03/24
                </Radio>
                <Radio
                  onClick={(e) => {
                    handleRadioClick((e.target as HTMLInputElement).value);
                  }}
                  value="luftbild21"
                >
                  Luftbildkarte 06/21
                </Radio>
              </Radio.Group>
            </div>
          </button>
        </div>
      </div>

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
      <p className="my-0 pt-2.5 text-gray-400 text-base">
        Aktuell: {getBackgroundDescription()}
      </p>
    </div>
  );
};

export default BaseLayerInfo;
