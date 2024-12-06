import type { Dispatch, Store } from "@reduxjs/toolkit";
import type { LatLng, Point } from "leaflet";

import { UIMode } from "../../store/slices/ui";

type Options = {
  dispatch: Dispatch;
  mode: UIMode;
  store: Store;
  zoom: number;
};

export const onClickTopicMap = async (
  e: {
    containerPoint: Point;
    latlng: LatLng;
    layerPoint: Point;
    originalEvent: PointerEvent;
    sourceTarget: HTMLElement;
    target: HTMLElement;
    type: string;
  },
  {}: Options
) => {
  console.log("onClickTopicMap", e);
};
