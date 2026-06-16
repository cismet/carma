/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */

import {
  useCallback,
  useContext,
  useEffect,
  useState,
  type WheelEvent,
} from "react";
import { useDispatch, useSelector } from "react-redux";

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
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { useWindowSize } from "@uidotdev/usehooks";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { cn } from "@carma-commons/utils";

import { AppDispatch } from "../../store";
import {
  getBackgroundLayer,
  getLayers,
  getSelectedLayerIndex,
  getSelectedLayerIndexIsNoSelection,
  getShowLeftScrollButton,
  getShowRightScrollButton,
  setLayers,
  setSelectedLayerIndex,
  setShowLeftScrollButton,
  setShowRightScrollButton,
} from "../../store/slices/mapping";
import GeoportalLayerButtonSlot from "./GeoportalLayerButtonSlot";
import SecondaryView from "./SecondaryView";

import "./button.css";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import InteractionView from "./InteractionView";
import { shouldShowAdhocLayerInLayerList } from "../../helper/adhoc-feature-utils";
import { useDynamicStylingSync } from "../../hooks/useDynamicStylingSync";

const scrollLayerBarBy = (left: number) => {
  document.getElementById("scrollWrapper")?.scrollBy({
    left,
    behavior: "smooth",
  });
};

const LayerWrapper = () => {
  const dispatch: AppDispatch = useDispatch();
  useDynamicStylingSync();
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const size = useWindowSize();

  const layers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);

  const selectedLayerIndex = useSelector(getSelectedLayerIndex);
  const isNoSelectionIndex = useSelector(getSelectedLayerIndexIsNoSelection);
  const showLeftScrollButton = useSelector(getShowLeftScrollButton);
  const showRightScrollButton = useSelector(getShowRightScrollButton);

  const { isCesium, isLeaflet } = useMapFrameworkSwitcherContext();

  const [isDragging, setIsDragging] = useState(false);

  const isSecondaryViewOpen =
    !isNoSelectionIndex &&
    !(selectedLayerIndex >= 0 && layers[selectedLayerIndex]?.skipSelection);

  const { isOver, setNodeRef } = useDroppable({
    id: "droppable",
  });
  const style = {
    color: isOver ? "green" : undefined,
  };

  const listedLayers = layers.filter((layer) =>
    shouldShowAdhocLayerInLayerList(layer, isCesium)
  );
  const pinnedFirstLayers = listedLayers.filter((l) => l.pinned === "first");
  const sortableLayers = listedLayers.filter((l) => !l.pinned);
  const pinnedLastLayers = listedLayers.filter((l) => l.pinned === "last");

  const getLayerPos = (id) => layers.findIndex((layer) => layer.id === id);

  const handleDragEnd = (event) => {
    setIsDragging(false);
    routedMapRef?.leafletMap?.leafletElement.dragging.enable();
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const originalPos = getLayerPos(active.id);
      const newPos = getLayerPos(over.id);
      const newLayers = arrayMove(layers, originalPos, newPos);
      dispatch(setLayers(newLayers));
      console.debug(
        "handleDragEnd newPos",
        newPos,
        selectedLayerIndex,
        isNoSelectionIndex
      );
      if (!isNoSelectionIndex && selectedLayerIndex !== newPos) {
        dispatch(setSelectedLayerIndex(newPos));
      }
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 2 } })
  );
  const handleDragStart = useCallback(() => {
    setIsDragging(true);
    routedMapRef?.leafletMap?.leafletElement.dragging.disable();
  }, [routedMapRef]);
  const handleScrollLeft = useCallback(() => {
    scrollLayerBarBy(-300);
  }, []);
  const handleScrollRight = useCallback(() => {
    scrollLayerBarBy(300);
  }, []);
  const handleLayerBarWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (event.deltaY !== 0) {
        event.currentTarget.scrollLeft += event.deltaY;
      }
    },
    []
  );

  useEffect(() => {
    if (size.width < 640 && (showLeftScrollButton || showRightScrollButton)) {
      dispatch(setShowLeftScrollButton(false));
      dispatch(setShowRightScrollButton(false));
    }
  }, [size]);

  console.debug("RENDER: LayerWrapper selectedLayerIndex", selectedLayerIndex);

  return (
    <>
      <DndContext
        onDragEnd={handleDragEnd}
        sensors={sensors}
        onDragStart={handleDragStart}
        modifiers={[restrictToHorizontalAxis]}
      >
        <div
          ref={setNodeRef}
          style={style}
          id="buttonWrapper"
          className="relative w-full h-9 z-[999] pointer-events-none"
        >
          <div className="relative w-[calc(100%-40px)] mx-auto h-full">
            {showLeftScrollButton && (
              <div
                className={cn(
                  "absolute left-14 top-0.5 bg-neutral-100 w-fit min-w-max flex items-center gap-2 px-3 rounded-3xl h-8 z-[99999999] button-shadow pointer-events-auto"
                )}
                role="button"
                onClick={handleScrollLeft}
              >
                <FontAwesomeIcon icon={faChevronLeft} />
              </div>
            )}
            {showRightScrollButton && (
              <div
                className={cn(
                  "absolute -right-7 top-0.5 bg-neutral-100 w-fit min-w-max flex items-center gap-2 px-3 rounded-3xl h-8 z-[99999999] button-shadow pointer-events-auto"
                )}
                role="button"
                onClick={handleScrollRight}
              >
                <FontAwesomeIcon icon={faChevronRight} />
              </div>
            )}
            <div className="w-full flex justify-center items-center h-full gap-2 pointer-events-none [&>*]:pointer-events-auto">
              <GeoportalLayerButtonSlot
                layer={backgroundLayer}
                index={-1}
                id={backgroundLayer.id}
                title=""
                background
              />

              {size.width > 640 && (
                <div
                  id="scrollWrapper"
                  className="flex overflow-x-auto items-center h-20 gap-2 scrollbar-hide"
                  onWheel={handleLayerBarWheel}
                >
                  {pinnedFirstLayers.map((layer) => (
                    <GeoportalLayerButtonSlot
                      title={layer.title}
                      id={layer.id}
                      key={layer.id}
                      index={layers.indexOf(layer)}
                      layer={layer}
                      hide={layer.type !== "object" && !isLeaflet}
                    />
                  ))}
                  <SortableContext
                    items={sortableLayers}
                    strategy={horizontalListSortingStrategy}
                  >
                    {sortableLayers.map((layer) => (
                      <GeoportalLayerButtonSlot
                        title={layer.title}
                        id={layer.id}
                        key={layer.id}
                        index={layers.indexOf(layer)}
                        layer={layer}
                        hide={layer.type !== "object" && !isLeaflet}
                      />
                    ))}
                  </SortableContext>
                  {pinnedLastLayers.map((layer) => (
                    <GeoportalLayerButtonSlot
                      title={layer.title}
                      id={layer.id}
                      key={layer.id}
                      index={layers.indexOf(layer)}
                      layer={layer}
                      hide={layer.type !== "object" && !isLeaflet}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </DndContext>

      {!isSecondaryViewOpen && size.width >= 640 && (
        <InteractionView isDragging={isDragging} />
      )}
      {isSecondaryViewOpen && <SecondaryView />}
    </>
  );
};

export default LayerWrapper;
