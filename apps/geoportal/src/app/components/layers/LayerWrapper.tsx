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
  arrayMove,
  horizontalListSortingStrategy,
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
  getLayerStack,
  getSelectedLayerIndex,
  getSelectedStackEntry,
  getSelectionShowsNoInfoView,
  getShowLeftScrollButton,
  getShowRightScrollButton,
  setLayers,
  setSelectedLayerIndex,
  setShowLeftScrollButton,
  setShowRightScrollButton,
} from "../../store/slices/mapping";
import { isLayerGroup } from "@carma-mapping/layers";
import type { Layer, LayerStackEntry } from "@carma-mapping/layers";
import GeoportalLayerButtonSlot from "./GeoportalLayerButtonSlot";
import GeoportalGroupedLayerButton from "./GeoportalGroupedLayerButton";
import SecondaryView from "./SecondaryView";

import "./button.css";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import InteractionView from "./InteractionView";
import { shouldShowAdhocLayerInLayerList } from "../../helper/adhoc-feature-utils";
import { useDynamicStylingSync } from "../../hooks/useDynamicStylingSync";
import { useHighlightLayerButton } from "../../hooks/useHighlightLayerButton";
import { useComparingLayerButton } from "../../hooks/useComparingLayerButton";

const scrollLayerBarBy = (left: number) => {
  document.getElementById("scrollWrapper")?.scrollBy({
    left,
    behavior: "smooth",
  });
};

const LayerWrapper = () => {
  const dispatch: AppDispatch = useDispatch();
  useDynamicStylingSync();
  useHighlightLayerButton();
  useComparingLayerButton();
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const size = useWindowSize();

  const layerStack = useSelector(getLayerStack);
  const backgroundLayer = useSelector(getBackgroundLayer);

  const selectedLayerIndex = useSelector(getSelectedLayerIndex);
  const selectedEntry = useSelector(getSelectedStackEntry);
  const showsNoInfoView = useSelector(getSelectionShowsNoInfoView);
  const showLeftScrollButton = useSelector(getShowLeftScrollButton);
  const showRightScrollButton = useSelector(getShowRightScrollButton);

  const { isCesium, isLeaflet } = useMapFrameworkSwitcherContext();

  const [isDragging, setIsDragging] = useState(false);

  const isSecondaryViewOpen = !showsNoInfoView;

  const { isOver, setNodeRef } = useDroppable({
    id: "droppable",
  });
  const style = {
    color: isOver ? "green" : undefined,
  };

  const listedEntries = layerStack.filter(
    (entry) =>
      isLayerGroup(entry) || shouldShowAdhocLayerInLayerList(entry, isCesium)
  );
  const pinnedFirstEntries = listedEntries.filter(
    (entry) => !isLayerGroup(entry) && entry.pinned === "first"
  );
  const sortableEntries = listedEntries.filter(
    (entry) => isLayerGroup(entry) || !entry.pinned
  );
  const pinnedLastEntries = listedEntries.filter(
    (entry) => !isLayerGroup(entry) && entry.pinned === "last"
  );
  const sortableItemIds = sortableEntries.map((entry) => entry.id);

  // a group button is hidden in 3D unless one of its members shows there
  const isEntryHidden = (entry: LayerStackEntry) =>
    isLayerGroup(entry)
      ? !isLeaflet && entry.layers.every((member) => member.type !== "object")
      : entry.type !== "object" && !isLeaflet;

  const handleDragEnd = (event) => {
    setIsDragging(false);
    routedMapRef?.leafletMap?.leafletElement.dragging.enable();
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const activeIndex = layerStack.findIndex((entry) => entry.id === active.id);
    const overIndex = layerStack.findIndex((entry) => entry.id === over.id);
    if (activeIndex === -1 || overIndex === -1) {
      return;
    }

    const selectedLayerId = selectedEntry?.id;

    const newStack = arrayMove(layerStack, activeIndex, overIndex);
    dispatch(setLayers(newStack));

    if (selectedLayerId) {
      const newIndex = newStack.findIndex(
        (entry) => entry.id === selectedLayerId
      );
      if (newIndex !== -1 && newIndex !== selectedLayerIndex) {
        dispatch(setSelectedLayerIndex(newIndex));
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
                  {pinnedFirstEntries.map((entry) => (
                    <GeoportalLayerButtonSlot
                      title={entry.title}
                      id={entry.id}
                      key={entry.id}
                      index={layerStack.indexOf(entry)}
                      layer={entry as Layer}
                      hide={isEntryHidden(entry)}
                    />
                  ))}
                  <SortableContext
                    items={sortableItemIds}
                    strategy={horizontalListSortingStrategy}
                  >
                    {sortableEntries.map((entry) =>
                      isLayerGroup(entry) ? (
                        <GeoportalGroupedLayerButton
                          key={entry.id}
                          group={entry}
                          index={layerStack.indexOf(entry)}
                          hide={isEntryHidden(entry)}
                        />
                      ) : (
                        <GeoportalLayerButtonSlot
                          title={entry.title}
                          id={entry.id}
                          key={entry.id}
                          index={layerStack.indexOf(entry)}
                          layer={entry}
                          hide={isEntryHidden(entry)}
                        />
                      )
                    )}
                  </SortableContext>
                  {pinnedLastEntries.map((entry) => (
                    <GeoportalLayerButtonSlot
                      title={entry.title}
                      id={entry.id}
                      key={entry.id}
                      index={layerStack.indexOf(entry)}
                      layer={entry as Layer}
                      hide={isEntryHidden(entry)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </DndContext>

      {size.width >= 640 && <InteractionView isDragging={isDragging} />}
      {isSecondaryViewOpen && <SecondaryView />}
    </>
  );
};

export default LayerWrapper;
