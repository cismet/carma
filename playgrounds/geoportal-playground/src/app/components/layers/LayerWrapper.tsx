import { useDispatch, useSelector } from "react-redux";
import {
  getBackgroundLayer,
  getLayers,
  getSelectedLayerIndex,
  getShowLeftScrollButton,
  getShowRightScrollButton,
  setLayers,
  setSelectedLayerIndex,
} from "../../store/slices/mapping";
import LayerButton from "./LayerButton";
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useContext } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { cn } from "../../helper/helper";
import "./button.css";
import SecondaryView from "./SecondaryView";
import { useOverlayHelper } from "@carma/helper-overlay";

const LayerWrapper = () => {
  const layerButtonTour = useOverlayHelper("Layer Buttons", {
    containerPos: "center",
    contentPos: "center",
  });
  const dispatch = useDispatch();
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const layers = useSelector(getLayers);
  const selectedLayerIndex = useSelector(getSelectedLayerIndex);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const showLeftScrollButton = useSelector(getShowLeftScrollButton);
  const showRightScrollButton = useSelector(getShowRightScrollButton);
  const { isOver, setNodeRef } = useDroppable({
    id: "droppable",
  });
  const style = {
    color: isOver ? "green" : undefined,
  };

  const getLayerPos = (id) => layers.findIndex((layer) => layer.id === id);

  const handleDragEnd = (event) => {
    routedMapRef?.leafletMap?.leafletElement.dragging.enable();
    const { active, over } = event;
    if (active.id !== over.id) {
      const originalPos = getLayerPos(active.id);
      const newPos = getLayerPos(over.id);
      const newLayers = arrayMove(layers, originalPos, newPos);

      dispatch(setLayers(newLayers));
      if (selectedLayerIndex !== -2) {
        dispatch(setSelectedLayerIndex(newPos));
      }
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 2 } }),
  );

  return (
    <>
      <DndContext
        onDragEnd={handleDragEnd}
        sensors={sensors}
        onDragStart={() =>
          routedMapRef?.leafletMap?.leafletElement.dragging.disable()
        }
        modifiers={[restrictToHorizontalAxis]}
      >
        <div
          ref={setNodeRef}
          style={style}
          id="buttonWrapper"
          className="absolute w-full h-9 pl-20 pr-[20px] top-2.5 z-[999]"
          onClick={() => {
            dispatch(setSelectedLayerIndex(-2));
          }}
        >
          <div className="relative w-[calc(100%-40px)] mx-auto h-full">
            {showLeftScrollButton && (
              <div
                className={cn(
                  "absolute left-14 top-0.5 bg-neutral-100 w-fit min-w-max flex items-center gap-2 px-3 rounded-3xl h-8 z-[99999999] button-shadow",
                )}
                role="button"
                onClick={() => {
                  document.getElementById("scrollWrapper").scrollBy({
                    left: -300,
                    behavior: "smooth",
                  });
                }}
              >
                <FontAwesomeIcon icon={faChevronLeft} />
              </div>
            )}
            {showRightScrollButton && (
              <div
                className={cn(
                  "absolute -right-7 top-0.5 bg-neutral-100 w-fit min-w-max flex items-center gap-2 px-3 rounded-3xl h-8 z-[99999999] button-shadow",
                )}
                role="button"
                onClick={() => {
                  document.getElementById("scrollWrapper").scrollBy({
                    left: 300,
                    behavior: "smooth",
                  });
                }}
              >
                <FontAwesomeIcon icon={faChevronRight} />
              </div>
            )}
            <div
              className="w-full flex justify-center items-center h-full gap-2"
              ref={layerButtonTour}
            >
              <LayerButton
                icon="background"
                layer={backgroundLayer}
                index={-1}
                id={backgroundLayer.id}
                title=""
                background
              />
              <div
                id="scrollWrapper"
                className="overflow-x-hidden sm:flex hidden items-center h-full gap-2"
              >
                <SortableContext
                  items={layers}
                  strategy={horizontalListSortingStrategy}
                >
                  {layers.map((layer, i) => (
                    <LayerButton
                      title={layer.title}
                      id={layer.id}
                      key={layer.id}
                      index={i}
                      icon={
                        layer.title.includes("Orthofoto")
                          ? "ortho"
                          : layer.title === "Bäume"
                          ? "bäume"
                          : layer.title.includes("gärten")
                          ? "gärten"
                          : undefined
                      }
                      layer={layer}
                    />
                  ))}
                </SortableContext>
              </div>
            </div>
          </div>
        </div>
      </DndContext>

      {selectedLayerIndex !== -2 && <SecondaryView />}
    </>
  );
};

export default LayerWrapper;
