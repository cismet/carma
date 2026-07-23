import type { PropsWithChildren } from "react";

import {
  GazDataProvider,
  SelectionProvider,
} from "@carma-appframeworks/portals";
import { defaultGazDataConfig } from "@carma-commons/resources";
import { SandboxedEvalProvider } from "@carma-commons/sandbox-eval";
import { cjsGlobalShim } from "@carma-commons/utils";
import {
  LibreContextProvider,
  MapHighlightProvider,
  MapSelectionProvider,
} from "@carma-mapping/engines/maplibre";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";

import {
  backgroundConfigurations,
  backgroundModes,
} from "../../../ng-topicmap-playground/src/app/backgroundConfig";

import "../map-stories.css";

cjsGlobalShim();

export function CarmaMapStoryProviders({ children }: PropsWithChildren) {
  return (
    <TopicMapContextProvider
      appKey="pointcloud-stories"
      infoBoxPixelWidth={350}
      backgroundModes={backgroundModes}
      backgroundConfigurations={backgroundConfigurations}
    >
      <SandboxedEvalProvider>
        <GazDataProvider config={defaultGazDataConfig}>
          <SelectionProvider>
            <LibreContextProvider>
              <MapSelectionProvider>
                <MapHighlightProvider>{children}</MapHighlightProvider>
              </MapSelectionProvider>
            </LibreContextProvider>
          </SelectionProvider>
        </GazDataProvider>
      </SandboxedEvalProvider>
    </TopicMapContextProvider>
  );
}
