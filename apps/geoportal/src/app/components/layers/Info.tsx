import { Radio, Tabs } from "antd";
import { cn, parseDescription } from "../../helper/helper";
import { tabItems } from "./items";
import { useDispatch, useSelector } from "react-redux";
import { getUIActiveTabKey, setUIActiveTabKey } from "../../store/slices/ui";
import {
  getBackgroundLayer,
  getLayers,
  getSelectedLayerIndex,
  getSelectedMapLayer,
  setBackgroundLayer,
  setLayers,
  setSelectedMapLayer,
} from "../../store/slices/mapping";
import { DndContext } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import LayerRow from "./LayerRow";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { layerMap } from "../../config";
import "./text.css";

interface InfoProps {
  description: string;
  legend: any;
}

const Info = ({ description, legend }: InfoProps) => {
  const dispatch = useDispatch();
  const selectedMapLayer = useSelector(getSelectedMapLayer);
  const activeTabKey = useSelector(getUIActiveTabKey);
  const parsedDescription = parseDescription(description);
  const layers = useSelector(getLayers);
  const selectedLayerIndex = useSelector(getSelectedLayerIndex);
  const isBaseLayer = selectedLayerIndex === -1;
  const backgroundLayer = useSelector(getBackgroundLayer);

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

  const handleRadioClick = (radioValue) => {
    if (
      backgroundLayer.id === "luftbild" &&
      selectedMapLayer.id === radioValue
    ) {
      dispatch(setBackgroundLayer({ ...selectedMapLayer, id: "karte" }));
    }
  };

  return (
    <>
      {parsedDescription && !isBaseLayer && (
        <div>
          <h5 className="font-semibold">Inhalt</h5>
          <p className="text-sm">{parsedDescription.inhalt}</p>
          <h5 className="font-semibold">Sichtbarkeit</h5>
          <p className="text-sm">
            {parsedDescription.sichtbarkeit.slice(0, -1)}
          </p>
          <h5 className="font-semibold">Nutzung</h5>
          <p className="text-sm">{parsedDescription.nutzung}</p>
        </div>
      )}
      {isBaseLayer && (
        <div className="flex flex-col gap-2 pb-4">
          <h5 className="font-semibold text-lg">Hintergrund:</h5>
          <div className="w-full flex last:rounded-s-md first:rounded-s-md">
            <button
              onClick={(e) => {
                if (
                  (e.target as HTMLElement).localName !== "span" &&
                  (e.target as HTMLElement).localName !== "input"
                ) {
                  dispatch(
                    setBackgroundLayer({ ...selectedMapLayer, id: "karte" }),
                  );
                }
              }}
              className={cn(
                "w-full group border-[1px] rounded-s-md",
                backgroundLayer.id !== "luftbild" && "border-[#1677ff]",
              )}
            >
              <div className="w-full flex flex-col text-[14px]/[30px] items-center justify-center gap-3">
                <p
                  className={cn(
                    "mb-0 group-hover:text-[#1677ff]",
                    backgroundLayer.id !== "luftbild" && "text-[#1677ff]",
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
                      }),
                    );

                    if (backgroundLayer.id === "karte") {
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
                        }),
                      );
                    }
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
              onClick={() => {
                dispatch(
                  setBackgroundLayer({
                    id: "luftbild",
                    title: layerMap["luftbild"].title,
                    opacity: 1.0,
                    description: layerMap["luftbild"].description,
                    inhalt: layerMap["luftbild"].inhalt,
                    eignung: layerMap["luftbild"].eignung,
                    layerType: "wmts",
                    visible: true,
                    props: {
                      name: "",
                      url: layerMap["luftbild"].url,
                    },
                    layers: layerMap["luftbild"].layers,
                  }),
                );
              }}
              className={cn(
                "w-full group rounded-e-md border-[1px]",
                backgroundLayer.id === "luftbild" && "border-[#1677ff]",
              )}
            >
              <div className="flex text-[14px]/[30px] flex-col items-center h-full justify-start">
                <p
                  className={cn(
                    "mb-0 group-hover:text-[#1677ff]",
                    backgroundLayer.id === "luftbild" && "text-[#1677ff]",
                  )}
                >
                  Luftbild
                </p>
              </div>
            </button>
          </div>
        </div>
      )}
      <hr className="h-px my-0 bg-gray-300 border-0 w-full" />
      {isBaseLayer ? (
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
                {layers.map((layer, i) => (
                  <LayerRow key={`layer.${i}`} layer={layer} id={layer.id} />
                ))}
              </SortableContext>
            </div>
          </DndContext>
        </div>
      ) : (
        <Tabs
          animated={false}
          items={tabItems(legend)}
          activeKey={activeTabKey}
          onChange={(key) => dispatch(setUIActiveTabKey(key))}
        />
      )}
    </>
  );
};

export default Info;
