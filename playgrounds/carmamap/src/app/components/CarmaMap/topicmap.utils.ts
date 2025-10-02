import type { Dispatch, Store } from "@reduxjs/toolkit";
import * as L from "leaflet";

import { UIMode } from "../../store/slices/ui";

type Options = {
  dispatch: Dispatch;
  mode: UIMode;
  store: Store;
  zoom: number;
};

export const onClickTopicMap = async (e: L.LeafletMouseEvent, {}: Options) => {
  console.log("onClickTopicMap", e);
};
