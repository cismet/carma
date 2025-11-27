import React, { useEffect, useState, useLayoutEffect } from "react";
import { useImmer } from "use-immer";
import localforage from "localforage";
import { setFromLocalforage } from "../utils/utils";

export function useWindowSize() {
  const [size, setSize] = useState([0, 0]);
  useLayoutEffect(() => {
    function updateSize() {
      setSize([window.innerWidth, window.innerHeight]);
    }
    window.addEventListener("resize", updateSize);
    updateSize();
    return () => window.removeEventListener("resize", updateSize);
  }, []);
  return size;
}

const defaultState = {
  windowSize: undefined,
  infoBoxPixelWidth: 300,
  searchBoxPixelWidth: 300,
  infoBoxControlPosition: "bottomright",
  searchBoxControlPosition: "bottomleft",
  responsiveState: "normal",
  gap: 25,
};
const StateContext = React.createContext(defaultState);
const DispatchContext = React.createContext(defaultState);
const ResponsiveTopicMapContextProvider = ({
  children,
  enabled = true,
  appKey,
  persistenceSettings,
  infoBoxPixelWidth = 300,
  searchBoxPixelWidth = 300,
}) => {
  const [state, dispatch] = useImmer({
    ...defaultState,
    infoBoxPixelWidth,
    searchBoxPixelWidth,
  });
  const [width, height] = useWindowSize();
  const windowSize = { width, height };
  const contextKey = "responsive";
  const set = (prop, noTest) => {
    return (x) => {
      dispatch((state) => {
        if (
          noTest === true ||
          JSON.stringify(state[prop]) !== JSON.stringify(x)
        ) {
          if (persistenceSettings[contextKey]?.includes(prop)) {
            localforage.setItem(
              "@" + appKey + "." + contextKey + "." + prop,
              x
            );
          }
          state[prop] = x;
        }
      });
    };
  };
  useEffect(() => {
    if (persistenceSettings && persistenceSettings[contextKey]) {
      for (const prop of persistenceSettings[contextKey]) {
        const localforagekey = "@" + appKey + "." + contextKey + "." + prop;
        const setter = set(prop, true);
        setFromLocalforage(localforagekey, setter);
      }
    }
  }, []);
  const setX = {
    setWindowSize: set("windowSize"),
    setInfoBoxPixelWidth: set("infoBoxPixelWidth"),
    setSearchBoxPixelWidth: set("searchBoxPixelWidth"),
    setInfoBoxControlPosition: set("infoBoxControlPosition"),
    setSearchBoxControlPosition: set("searchBoxControlPosition"),
    setResponsiveState: set("responsiveState"),
  };

  useEffect(() => {
    setX.setWindowSize(windowSize);
    let widthRight = state.infoBoxPixelWidth;
    let width = windowSize.width;
    let gap = 25;
    let widthLeft = state.searchBoxPixelWidth;

    if (width - gap - widthLeft - widthRight <= 0) {
      setX.setResponsiveState("small");
    } else {
      setX.setResponsiveState("normal");
    }
  }, [windowSize]);

  // useEffect(
  // 	() => {
  // 		let widthRight = state.infoBoxPixelWidth;
  // 		let width = windowSize.width;
  // 		let gap = 25;
  // 		let widthLeft = state.searchBoxPixelWidth;

  // 		if (width - gap - widthLeft - widthRight <= 0) {
  // 			setX.setResponsiveState('small');
  // 		} else {
  // 			setX.setResponsiveState('normal');
  // 		}
  // 	},
  // 	[ state.windowSize, state.searchBoxPixelWidth, state.infoBoxPixelWidth ]
  // );

  if (enabled === true) {
    return (
      <StateContext.Provider value={state}>
        <DispatchContext.Provider
          value={{
            dispatch,
            ...setX,
          }}
        >
          {children}
        </DispatchContext.Provider>
      </StateContext.Provider>
    );
  } else {
    return (
      <StateContext.Provider value={undefined}>
        <DispatchContext.Provider
          value={{
            undefined,
          }}
        >
          {children}
        </DispatchContext.Provider>
      </StateContext.Provider>
    );
  }
};
export default ResponsiveTopicMapContextProvider;

export {
  ResponsiveTopicMapContextProvider,
  StateContext as ResponsiveTopicMapContext,
  DispatchContext as ResponsiveTopicMapDispatchContext,
};
