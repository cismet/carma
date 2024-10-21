import { createHashRouter, RouterProvider } from "react-router-dom";
import { TopicMapContextProvider } from "react-cismap/contexts/TopicMapContextProvider";

import { TopicMapInContext } from "./TopicMapInContext.tsx";

// TODO WORKAROUND for TopicMap in Context to not trigger Rerenders elsewhere on routing and location changes

export const TopicMapWrapper = ({
  backgroundLayer,
  gazData,
  gazetteerHit,
  layers,
  leafletConfig,
  overlayFeature,
  pos,
  setPos,
  tooltipText,
  version,
  wrapperRef,
}) => {
  return (
    <div className={"map-container-2d"} style={{ zIndex: 400 }}>
      <RouterProvider
        router={createHashRouter([
          {
            path: "/",
            element: (
              <TopicMapContextProvider>
                <TopicMapInContext
                  backgroundLayer={backgroundLayer}
                  gazData={gazData}
                  gazetteerHit={gazetteerHit}
                  layers={layers}
                  leafletConfig={leafletConfig}
                  overlayFeature={overlayFeature}
                  pos={pos}
                  setPos={setPos}
                  tooltipText={tooltipText}
                  version={version}
                  wrapperRef={wrapperRef}
                />
              </TopicMapContextProvider>
            ),
          },
        ])}
      ></RouterProvider>
    </div>
  );
};
