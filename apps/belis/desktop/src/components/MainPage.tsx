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
} from "@carma-appframeworks/belis";
import { AppDispatch } from "../store";
import {
  getFilter,
  isInFocusMode,
  setDone,
  setFeatureCollection,
  setFocusModeActive,
} from "../store/slices/featureCollection";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { DOMAIN, REST_SERVICE } from "../constants/belis";
import type { UnknownAction } from "redux";
import {
  getZoom,
  isInPaleMode,
  isInSearchMode,
  isSearchForbidden,
  searchMinimumZoomThreshhold,
  setPaleModeActive,
  setSearchMode,
  setWishedSearchMode,
} from "../store/slices/mapSettings";
import Filter from "./ui/Filter";

const MainPage = () => {
  const dispatch: AppDispatch = useDispatch();
  const storedJWT = useSelector(getJWT);
  const isCollapsed = useSelector(getIsMenuCollapsed);
  const filter = useSelector(getFilter);
  const inFocusMode = useSelector(isInFocusMode);
  const inPaleMode = useSelector(isInPaleMode);
  const inSearchMode = useSelector(isInSearchMode);
  const zoom = useSelector(getZoom);

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
              <Filter />
              <BelisSwitch
                key={"automatische-suche-toggle-key" + inSearchMode + zoom}
                id="automatische-suche-toggle"
                disabled={zoom < searchMinimumZoomThreshhold}
                preLabel="automatische Suche"
                switched={inSearchMode}
                stateChanged={(switched) => {
                  dispatch(setSearchMode(switched));
                  if (switched === true) {
                    dispatch(setWishedSearchMode(true));
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
                        setDone,
                        isSearchForbidden
                      ) as unknown as UnknownAction
                    );
                  } else {
                    dispatch(setWishedSearchMode(false));
                  }
                }}
              />
              <BelisSwitch
                preLabel="Fokus"
                switched={inFocusMode}
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
                        setDone,
                        isSearchForbidden
                      ) as unknown as UnknownAction
                    );
                  }, 300);
                }}
              />
              <BelisSwitch
                id="pale-toggle"
                preLabel="Blass"
                switched={inPaleMode}
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
