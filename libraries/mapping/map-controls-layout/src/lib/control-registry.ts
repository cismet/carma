import type { ReactNode } from "react";
import type { Positions } from "./map-control";

export type ControlSlot = {
  id: number;
  position: Positions;
  order: number;
  /** stays on screen while the layout hides its controls */
  keepVisible?: boolean;
};

type Listener = () => void;

/**
 * Keeps the slot list (position and order) apart from each control's
 * content, so a content change notifies only that control's subscribers and
 * leaves the layout and the other controls alone.
 */
export type ControlRegistry = {
  /** the slots to render: all of them, or only the kept ones while hiding */
  getSlots: () => readonly ControlSlot[];
  subscribeSlots: (listener: Listener) => () => void;
  getContent: (id: number) => ReactNode;
  subscribeContent: (id: number, listener: Listener) => () => void;
  register: (
    position: Positions,
    order: number,
    content: ReactNode,
    keepVisible?: boolean
  ) => number;
  update: (
    id: number,
    position: Positions,
    order: number,
    content: ReactNode,
    keepVisible?: boolean
  ) => void;
  unregister: (id: number) => void;
  /** take every slot without `keepVisible` off the screen, or bring it back */
  setHideControls: (hide: boolean) => void;
};

export const createControlRegistry = (): ControlRegistry => {
  let nextId = 1;
  let slots: readonly ControlSlot[] = [];
  let hideControls = false;
  let renderedSlots: readonly ControlSlot[] = slots;
  const contents = new Map<number, ReactNode>();
  const slotListeners = new Set<Listener>();
  const contentListeners = new Map<number, Set<Listener>>();

  const publishSlots = () => {
    renderedSlots = hideControls
      ? slots.filter((slot) => slot.keepVisible)
      : slots;
    slotListeners.forEach((listener) => listener());
  };

  const setSlots = (next: readonly ControlSlot[]) => {
    slots = next;
    publishSlots();
  };

  return {
    getSlots: () => renderedSlots,
    subscribeSlots: (listener) => {
      slotListeners.add(listener);
      return () => {
        slotListeners.delete(listener);
      };
    },
    getContent: (id) => contents.get(id),
    subscribeContent: (id, listener) => {
      let listeners = contentListeners.get(id);
      if (!listeners) {
        listeners = new Set();
        contentListeners.set(id, listeners);
      }
      const owned = listeners;
      owned.add(listener);
      return () => {
        owned.delete(listener);
        if (owned.size === 0 && contentListeners.get(id) === owned) {
          contentListeners.delete(id);
        }
      };
    },
    register: (position, order, content, keepVisible) => {
      const id = nextId++;
      contents.set(id, content);
      setSlots([...slots, { id, position, order, keepVisible }]);
      return id;
    },
    update: (id, position, order, content, keepVisible) => {
      const index = slots.findIndex((slot) => slot.id === id);
      if (index < 0) return;
      if (contents.get(id) !== content) {
        contents.set(id, content);
        contentListeners.get(id)?.forEach((listener) => listener());
      }
      const slot = slots[index];
      if (
        slot.position !== position ||
        slot.order !== order ||
        slot.keepVisible !== keepVisible
      ) {
        const next = [...slots];
        next[index] = { id, position, order, keepVisible };
        setSlots(next);
      }
    },
    unregister: (id) => {
      if (!slots.some((slot) => slot.id === id)) return;
      contents.delete(id);
      setSlots(slots.filter((slot) => slot.id !== id));
    },
    setHideControls: (hide) => {
      if (hide === hideControls) return;
      hideControls = hide;
      publishSlots();
    },
  };
};
