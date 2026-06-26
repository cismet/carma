import {
  type RefCallback,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type HostElementSize = {
  width: number;
  height: number;
};

export type HostElementSizeRef<TElement extends HTMLElement> = {
  ref: RefCallback<TElement>;
  elementRef: RefObject<TElement | null>;
  size: HostElementSize | null;
  isReady: boolean;
};

type HostElementSnapshot<TElement extends HTMLElement> = {
  element: TElement | null;
  size: HostElementSize | null;
};

const readHostElementSize = (
  element: HTMLElement | null | undefined
): HostElementSize | null => {
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return { width, height };
};

const isSameHostElementSize = (
  previous: HostElementSize | null,
  next: HostElementSize | null
): boolean =>
  previous === next ||
  Boolean(
    previous &&
      next &&
      previous.width === next.width &&
      previous.height === next.height
  );

const isSameHostElementSnapshot = <TElement extends HTMLElement>(
  previous: HostElementSnapshot<TElement>,
  next: HostElementSnapshot<TElement>
): boolean =>
  previous.element === next.element &&
  isSameHostElementSize(previous.size, next.size);

const useMeasuredHostElement = <TElement extends HTMLElement>(
  observedElement: TElement | null
): HostElementSnapshot<TElement> => {
  const [snapshot, setSnapshot] = useState<HostElementSnapshot<TElement>>({
    element: null,
    size: null,
  });

  useLayoutEffect(() => {
    const syncHostElement = () => {
      const size = readHostElementSize(observedElement);
      const nextSnapshot: HostElementSnapshot<TElement> =
        observedElement && size
          ? { element: observedElement, size }
          : { element: null, size: null };

      setSnapshot((previous) =>
        isSameHostElementSnapshot(previous, nextSnapshot)
          ? previous
          : nextSnapshot
      );
    };

    syncHostElement();

    if (!observedElement || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(syncHostElement);
    resizeObserver.observe(observedElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [observedElement]);

  return snapshot;
};

export const useHostElementSizeRef = <
  TElement extends HTMLElement
>(): HostElementSizeRef<TElement> => {
  const [observedElement, setObservedElement] = useState<TElement | null>(null);
  const { element, size } = useMeasuredHostElement(observedElement);
  const elementRef = useRef<TElement | null>(null);
  elementRef.current = element;

  const ref = useCallback<RefCallback<TElement>>((nextElement) => {
    setObservedElement((previous) =>
      previous === nextElement ? previous : nextElement
    );
  }, []);

  return { ref, elementRef, size, isReady: size !== null };
};

export const useHostElementSize = <TElement extends HTMLElement>(
  elementRef: RefObject<TElement | null>
): HostElementSize | null => {
  const [observedElement, setObservedElement] = useState<TElement | null>(null);
  const { size } = useMeasuredHostElement(observedElement);

  useLayoutEffect(() => {
    setObservedElement((previous) =>
      previous === elementRef.current ? previous : elementRef.current
    );
  });

  return size;
};

export default useHostElementSize;
