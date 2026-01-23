import { CarmaMap } from "@carma-appframeworks/portals";
import { CustomCard } from "./CustomCard";
import { BelisSwitch } from "@carma-appframeworks/belis";

const BelisPlayground = () => {
  return (
    <div className="bg-[#F1F1F1] flex flex-col w-full h-screen overflow-hidden">
      <div className="flex items-center mx-3 mb-2 mt-2">
        <span className="font-semibold mr-8 text-lg">BelISDesktop</span>
      </div>
      <div className="w-full flex-1 flex flex-col min-h-0">
        <div className="mx-3 my-2 flex-1 flex flex-col min-h-0">
          <CustomCard
            title="Karte"
            style={{ flex: 1, minHeight: 0 }}
            extra={
              <div className="flex items-center gap-4">
                <BelisSwitch
                  preLabel="Fokus"
                  switched={false}
                  stateChanged={(switched) => {}}
                />
                <BelisSwitch
                  id="pale-toggle"
                  preLabel="Blass"
                  switched={false}
                  stateChanged={(switched) => {}}
                />
              </div>
            }
          >
            <CarmaMap
              mapEngine="maplibre"
              embedded // used if map is not in fullscreen mode
              terrainControl={false}
              libreLayers={[
                // {
                //   type: "vector",
                //   name: "background",
                //   style:
                //     "https://omt.map-hosting.de/styles/osm-bright-grey/style.json",
                // },
                {
                  type: "vector",
                  name: "Leuchten",
                  style: "https://tiles.cismet.de/belis/style.json",
                },
              ]}
            />
          </CustomCard>
        </div>
      </div>
    </div>
  );
};

export default BelisPlayground;
