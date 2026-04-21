import { useLayoutEffect, useRef } from "react";
import type { RefObject, MutableRefObject } from "react";

interface UseScrollToSelectedTableRowOptions {
  selectedId: number | string | null;
  wrapperRef: RefObject<HTMLDivElement>;
  fromClickRef: MutableRefObject<boolean>;
}

export function useScrollToSelectedTableRow({
  selectedId,
  wrapperRef,
  fromClickRef,
}: UseScrollToSelectedTableRowOptions) {
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const scrollBody = wrapper.querySelector<HTMLElement>(".ant-table-body");

    if (selectedId == null) {
      if (scrollBody) scrollBody.scrollTop = 0;
      return;
    }

    if (fromClickRef.current) {
      fromClickRef.current = false;
      return;
    }

    if (!scrollBody) return;
    const row = wrapper.querySelector<HTMLElement>(
      `tr[data-row-key="${selectedId}"]`
    );
    if (!row) return;

    const bodyRect = scrollBody.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const isVisible =
      rowRect.top >= bodyRect.top && rowRect.bottom <= bodyRect.bottom;

    if (!isVisible) {
      row.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedId, wrapperRef, fromClickRef]);
}
