import { useContext } from "react";
import BelisMapLibWrapper from "../commons/BelisMapWrapper";
import { useSelector, useDispatch } from "react-redux";
import { getJWT } from "../../store/slices/auth";
import { CustomCard } from "../commons/CustomCard";
import { useWindowSize } from "@react-hook/window-size";
import {
  BelisSwitch,
  loadObjectsIntoFeatureCollection,
} from "@carma-appframeworks/belis";
import { AppDispatch } from "../../store";
import {
  getFilter,
  isInFocusMode,
  setDone,
  setFeatureCollection,
  setFocusModeActive,
} from "../../store/slices/featureCollection";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useDatasheet } from "@carma-mapping/engines/maplibre";
import { DOMAIN, REST_SERVICE } from "../../constants/belis";
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
} from "../../store/slices/mapSettings";
import Filter from "../ui/Filter";

const MainPage = () => {
  const dispatch: AppDispatch = useDispatch();
  const storedJWT = useSelector(getJWT);
  const filter = useSelector(getFilter);
  const inFocusMode = useSelector(isInFocusMode);
  const inPaleMode = useSelector(isInPaleMode);
  const inSearchMode = useSelector(isInSearchMode);
  const zoom = useSelector(getZoom);

  const { isDatasheetOpen } = useDatasheet();
  const [windowWidth, windowHeight] = useWindowSize();
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  const cardGaps = 24 + 24 + 1;
  const navbarHeight = 60;

  const mapStyle = {
    height: windowHeight - navbarHeight - 76,
    width: windowWidth - cardGaps,
    cursor: "pointer",
    clear: "both",
  };

  return (
    <>
      <div className="mx-3 mt-1">
        <CustomCard
          title={isDatasheetOpen ? "Datenblatt" : "Karte"}
          style={{ marginBottom: "8px" }}
          extra={
            <div className="flex items-center gap-4">
              <Filter />
              {/* <BelisSwitch
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
              /> */}
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
          <BelisMapLibWrapper mapSizes={mapStyle} />
        </CustomCard>
      </div>
    </>
  );
};

export default MainPage;
