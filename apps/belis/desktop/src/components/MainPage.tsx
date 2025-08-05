import { useContext, useRef } from "react";
import BelisMapLibWrapper from "./commons/BelisMapWrapper";
import { useSelector, useDispatch } from "react-redux";
import { getJWT } from "../store/slices/auth";
import { CustomCard } from "./commons/CustomCard";
import TopNavbar from "./commons/TopNavbar";
import useComponentSize from "@rehooks/component-size";
import { useWindowSize } from "@react-hook/window-size";
import { getIsMenuCollapsed } from "../store/slices/ui";
import {
  BelisSwitch,
  loadObjectsIntoFeatureCollection,
} from "@carma-apps/belis-library";
import { AppDispatch } from "../store";
import {
  getFilter,
  setDone,
  setFeatureCollection,
  setFocusModeActive,
} from "../store/slices/featureCollection";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { DOMAIN, REST_SERVICE } from "../constants/belis";
import type { UnknownAction } from "redux";
import { setPaleModeActive } from "../store/slices/mapSettings";

const MainPage = () => {
  const dispatch: AppDispatch = useDispatch();
  const storedJWT = useSelector(getJWT);
  const isCollapsed = useSelector(getIsMenuCollapsed);
  const filter = useSelector(getFilter);

  let refUpperToolbar = useRef(null);
  let sizeU = useComponentSize(refUpperToolbar);
  const [windowWidth, windowHeight] = useWindowSize();
  useComponentSize(refUpperToolbar);
  let refRoutedMap = useRef(null);
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  const menuWidth = !isCollapsed ? 204 : 72;
  const cardGaps = 24 + 24 + 1;

  const mapStyle = {
    height: windowHeight - sizeU.height - 76 - 20,
    width: windowWidth - menuWidth - cardGaps,
    cursor: "pointer",
    clear: "both",
  };

  return (
    <>
      <TopNavbar innerRef={refUpperToolbar} />
      <div className="mx-3 mt-1">
        <CustomCard
          title="Karte"
          style={{ marginBottom: "8px" }}
          extra={
            <div className="flex items-center gap-4">
              <BelisSwitch
                preLabel="Fokus"
                stateChanged={(switched) => {
                  dispatch(setFocusModeActive(switched));
                  setTimeout(() => {
                    dispatch(
                      loadObjectsIntoFeatureCollection(
                        {
                          boundingBox: routedMapRef.getBoundingBox(),
                          inFocusMode: switched,
                          jwt: storedJWT,
                        },
                        REST_SERVICE,
                        DOMAIN,
                        setFeatureCollection,
                        filter,
                        setDone
                      ) as unknown as UnknownAction
                    );
                  }, 300);
                }}
              />
              <BelisSwitch
                id="pale-toggle"
                preLabel="Blass"
                stateChanged={(switched) =>
                  dispatch(setPaleModeActive(switched))
                }
              />
            </div>
          }
        >
          <BelisMapLibWrapper
            refRoutedMap={refRoutedMap}
            jwt={storedJWT}
            mapSizes={mapStyle}
          />
        </CustomCard>
      </div>
    </>
  );
};

export default MainPage;
