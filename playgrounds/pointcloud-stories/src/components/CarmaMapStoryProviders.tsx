import type { PropsWithChildren } from "react";

import {
  AdhocFeatureDisplayProvider,
  GazDataProvider,
  SelectionProvider,
} from "@carma-appframeworks/portals";
import { defaultGazDataConfig } from "@carma-commons/resources";
import { SandboxedEvalProvider } from "@carma-commons/sandbox-eval";
import { HashStateProvider } from "@carma-providers/hash-state";
import { MemoryRouter } from "react-router-dom";
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
            {/* PointCloudPlayground keeps camera and layer state in the URL
                hash, mirroring the provider order of the ng playground. The
                router stays in memory so the provider's history access works
                without competing with Storybook for the preview URL. */}
            <MemoryRouter>
              <HashStateProvider>
                <AdhocFeatureDisplayProvider>
                  <LibreContextProvider>
                    <MapSelectionProvider>
                      <MapHighlightProvider>{children}</MapHighlightProvider>
                    </MapSelectionProvider>
                  </LibreContextProvider>
                </AdhocFeatureDisplayProvider>
              </HashStateProvider>
            </MemoryRouter>
          </SelectionProvider>
        </GazDataProvider>
      </SandboxedEvalProvider>
    </TopicMapContextProvider>
  );
}
