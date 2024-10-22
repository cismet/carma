import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import LZString from "lz-string";

import {
  setBackgroundLayer,
  setLayers,
  setShowFullscreenButton,
  setShowHamburgerMenu,
  setShowLocatorButton,
  setShowMeasurementButton,
} from "../store/slices/mapping";
import {
  setUIAllowChanges,
  setSyncToken,
  setUIPublished,
  setUIShowLayerButtons,
  setUIShowLayerHideButtons,
  getUIPublished,
} from "../store/slices/ui";
import { useEffect } from "react";
import { AppConfig } from "../App";

export default function HashHookComponent({
  published,
}: {
  published: boolean;
}) {
  const dispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const uiPublished = useSelector(getUIPublished);


  useEffect(() => {
    console.debug("HOOK: HashHookComponent useEffect", published, uiPublished);
    if (published !== uiPublished) {
      dispatch(setUIPublished(published));
    }
  }, [published, uiPublished, dispatch]);

  useEffect(() => {
    console.debug("HOOK: App useEffect", published, searchParams);
    if (searchParams.get("sync")) {
      dispatch(setSyncToken(searchParams.get("sync")));
    }

    if (searchParams.get("data")) {
      const data = searchParams.get("data");
      const newConfig: AppConfig = JSON.parse(
        LZString.decompressFromEncodedURIComponent(data),
      );
      dispatch(setLayers(newConfig.layers));
      dispatch(setBackgroundLayer(newConfig.backgroundLayer));
      if (newConfig.settings) {
        dispatch(setUIShowLayerButtons(newConfig.settings.showLayerButtons));
        dispatch(setShowFullscreenButton(newConfig.settings.showFullscreen));
        dispatch(setShowLocatorButton(newConfig.settings.showLocator));
        dispatch(setShowMeasurementButton(newConfig.settings.showMeasurement));
        dispatch(setShowHamburgerMenu(newConfig.settings.showHamburgerMenu));

        if (newConfig.settings.showLayerHideButtons || published) {
          dispatch(setUIAllowChanges(false));
          dispatch(setUIShowLayerHideButtons(true));
        } else {
          dispatch(setUIAllowChanges(true));
          dispatch(setUIShowLayerHideButtons(false));
        }
      }
      console.debug("HOOK: App useEffect, applied newConfig", `\n${JSON.stringify(newConfig.settings, null, 2)}`);
      searchParams.delete("data");
      setSearchParams(searchParams);
    }
  }, [searchParams, published, dispatch, setSearchParams]);

  return null;
}
