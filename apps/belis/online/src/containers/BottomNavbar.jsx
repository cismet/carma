import { blue, green, red } from "@ant-design/colors";
import {
  faCheck,
  faCloudShowersHeavy,
  faDatabase,
  faShare,
  faUser,
  faUserAltSlash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon as Icon } from "@fortawesome/react-fontawesome";
import { useWindowSize } from "@react-hook/window-size";
import React, { useContext, useEffect, useState } from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Form from "react-bootstrap/Form";
import Nav from "react-bootstrap/Nav";
import Navbar from "react-bootstrap/Navbar";
import ProgressBar from "react-bootstrap/ProgressBar";
import {
  TopicMapStylingContext,
  TopicMapStylingDispatchContext,
} from "react-cismap/contexts/TopicMapStylingContextProvider";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "react-router-dom";

import MySwitch from "../components/commons/Switch";
import {
  CONNECTIONMODE,
  getConnectionMode,
  setConnectionMode,
} from "../core/store/slices/app";
import { getLoginFromJWT, setLoginRequested } from "../core/store/slices/auth";
import { getBackground } from "../core/store/slices/background";
import {
  getCacheDate,
  getCacheUser,
  isCacheFullUsable,
} from "../core/store/slices/cacheControl";
import {
  forceRefresh,
  isInFocusMode,
  loadObjects,
  setFocusModeActive,
} from "../core/store/slices/featureCollection";
import { getHealthState, HEALTHSTATUS } from "../core/store/slices/health";
import { getTasks } from "../core/store/slices/offlineActionDb";
import {
  isPaleModeActive,
  setPaleModeActive,
} from "../core/store/slices/paleMode";

//---------

const BottomNavbar = ({
  innerRef,
  onlineStatus,
  refRoutedMap,
  jwt,
  setAppMenuVisible,
  setAppMenuActiveMenuSection,
}) => {
  const dispatch = useDispatch();
  const browserlocation = useLocation();
  // eslint-disable-next-line no-unused-vars
  const [windowWidth, windowHeight] = useWindowSize();

  const inFocusMode = useSelector(isInFocusMode);
  const cacheDate = useSelector(getCacheDate);
  const cacheUser = useSelector(getCacheUser);
  const inPaleMode = useSelector(isPaleModeActive);
  const background = useSelector(getBackground);
  const connectionMode = useSelector(getConnectionMode);

  const isCacheReady = useSelector(isCacheFullUsable);

  const healthState = useSelector(getHealthState);
  const uiThreadProgressbar =
    new URLSearchParams(browserlocation.search).get("uiThreadProgressbar") ===
    "true";
  let user;

  const tasks = useSelector(getTasks);
  // eslint-disable-next-line no-unused-vars
  const [rerenderCount, setRerenderCount] = useState(0);

  const [numberOfPendingTasks, setNumberOfPendingTasks] = useState(0);
  const [numberOfErrorTasks, setNumberOfErrorTasks] = useState(0);
  const [newest200Status, setNewest200Status] = useState(undefined);
  const [showingGreenCheck, setShowingGreenCheck] = useState(false);
  const { setSelectedBackground } = useContext(TopicMapStylingDispatchContext);
  const { selectedBackground } = useContext(TopicMapStylingContext);
  useEffect(() => {
    let numberOfPendingTasks = 0;
    let numberOfErrorTasks = 0;
    let newest = undefined;

    for (const task of tasks) {
      if (task.statusCode === undefined || task.statusCode === 202) {
        numberOfPendingTasks++;
      }
      if (task.statusCode === 401 || task.statusCode === 500) {
        numberOfErrorTasks++;
      }
      if (task.statusCode === 200) {
        if (newest === undefined || new Date(task.datum).getTime() > newest) {
          newest = new Date(task.datum).getTime();
        }
      }
      setNumberOfPendingTasks(numberOfPendingTasks);
      setNumberOfErrorTasks(numberOfErrorTasks);
      setNewest200Status(newest);
    }
  }, [tasks]);

  useEffect(() => {
    const checker = setInterval(() => {
      if (newest200Status !== undefined) {
        if (newest200Status + 1000 * 20 < Date.now()) {
          clearInterval(checker);
          setShowingGreenCheck(false);
        } else {
          setShowingGreenCheck(true);
        }
      }
    }, 1000);
  }, [newest200Status]);

  if (connectionMode === CONNECTIONMODE.FROMCACHE) {
    user = cacheUser;
  } else {
    user = getLoginFromJWT(jwt);
  }
  let fontSize, fontSizeIconPixel, iconWidth, toggleSize;

  if (windowWidth <= 1200) {
    fontSize = "0.8rem";
    fontSizeIconPixel = 18;
    iconWidth = "24px";
    toggleSize = "small";
  } else {
    fontSize = "1rem";
    fontSizeIconPixel = 24;
    iconWidth = "24px";
    toggleSize = "large";
  }

  return (
    <div style={{ fontSize }}>
      <Navbar
        ref={innerRef}
        bg={background === "nightplan" ? "dark" : "light"}
        expand="lg"
      >
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Nav className="mr-auto">
          <div>
            {connectionMode === CONNECTIONMODE.ONLINE && (
              <Icon
                style={{
                  fontSize: fontSizeIconPixel,
                  width: iconWidth,
                  cursor: "pointer",
                  paddingTop: 2,
                }}
                className="text-primary"
                icon={faUser}
                onClick={() => {
                  dispatch(setConnectionMode(CONNECTIONMODE.FROMCACHE));
                }}
              />
            )}
            {connectionMode === CONNECTIONMODE.FROMCACHE && (
              <Icon
                style={{
                  fontSize: fontSizeIconPixel,
                  width: iconWidth,
                  cursor: "pointer",
                  paddingTop: 2,
                }}
                className="text-primary"
                icon={faDatabase}
                onClick={() => {
                  dispatch(setConnectionMode(CONNECTIONMODE.ONLINE));
                }}
              />
            )}
            {user && <span style={{ marginLeft: 10 }}>{user}</span>}
          </div>
          <div style={{ marginLeft: 10 }}>
            <ButtonGroup className="mr-2" aria-label="ModusGroup">
              <Button
                style={{ fontSize }}
                variant={
                  connectionMode === CONNECTIONMODE.ONLINE
                    ? "primary"
                    : "outline-primary"
                }
                onClick={() => {
                  if (connectionMode !== CONNECTIONMODE.ONLINE) {
                    dispatch(setConnectionMode(CONNECTIONMODE.ONLINE));
                    setTimeout(() => {
                      dispatch(forceRefresh());
                    }, 100);
                  }
                }}
              >
                Live-Daten
              </Button>
              <Button
                style={{ fontSize }}
                disabled={isCacheReady === false}
                variant={
                  connectionMode === CONNECTIONMODE.FROMCACHE
                    ? "primary"
                    : "outline-primary"
                }
                onClick={() => {
                  if (connectionMode !== CONNECTIONMODE.FROMCACHE) {
                    dispatch(setConnectionMode(CONNECTIONMODE.FROMCACHE));
                    setTimeout(() => {
                      dispatch(forceRefresh());
                    }, 100);
                  }
                }}
              >
                <span>
                  lokale Daten{" "}
                  {cacheDate !== undefined && cacheDate !== -1 && (
                    <span>
                      (
                      {isToday(cacheDate)
                        ? new Date(cacheDate).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : new Date(cacheDate).toLocaleDateString()}
                      )
                    </span>
                  )}
                </span>
              </Button>
            </ButtonGroup>
          </div>
          {/*           
          
          {cachingProgress >= 1 && (
            <Button
              variant={"outline-primary"}
              style={{ marginLeft: 20, fontSize }}
              onClick={() => {
                dispatch(renewAllSecondaryInfoCache(jwt));
                dispatch(renewAllPrimaryInfoCache(jwt));
              }}
            >
              Daten aktualisieren
            </Button>
          )}
          {cachingProgress < 1 && (
            <ProgressBar
              style={{
                marginLeft: 29,
                minHeight: 31.5,
                minWidth: 141,
                fontSize: 14,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "#377CF6",
              }}
              animated
              now={cachingProgress * 100 + 10}
              max={110}
            />
          )} */}

          {healthState === HEALTHSTATUS.UNAUTHORIZED && (
            <Icon
              style={{
                fontSize: fontSizeIconPixel,
                width: iconWidth,
                cursor: "pointer",
                paddingTop: 2,
                marginLeft: 10,
              }}
              onClick={() => {
                dispatch(setLoginRequested(true));
              }}
              className="text-primary"
              icon={faUserAltSlash}
            />
          )}
          {healthState === HEALTHSTATUS.ERROR && (
            <Icon
              style={{
                fontSize: fontSizeIconPixel,
                width: iconWidth,
                paddingTop: 2,
                marginLeft: 10,
              }}
              className="text-primary"
              icon={faCloudShowersHeavy}
            />
          )}
        </Nav>

        <Nav className="mr-auto">
          <MySwitch
            id="focus-toggle"
            preLabel="Fokus"
            switched={inFocusMode}
            size={toggleSize}
            style={{ paddingTop: 5 }}
            stateChanged={(switched) => {
              dispatch(setFocusModeActive(switched));
              setTimeout(() => {
                dispatch(
                  loadObjects({
                    boundingBox: refRoutedMap.current.getBoundingBox(),
                    inFocusMode: switched,
                    jwt: jwt,
                  })
                );
              }, 300);
            }}
          />

          <div style={{ width: 10 }} />
          <MySwitch
            id="pale-toggle"
            preLabel="Blass"
            switched={inPaleMode}
            stateChanged={(switched) => dispatch(setPaleModeActive(switched))}
            size={toggleSize}
            style={{ paddingTop: 5 }}
          />
        </Nav>

        <Form inline>
          <ButtonGroup className="mr-2" aria-label="First group">
            <Button
              style={{ fontSize }}
              variant={
                selectedBackground === "stadtplan"
                  ? "primary"
                  : "outline-primary"
              }
              onClick={() => {
                // dispatch(setBackground("stadtplan"));
                setSelectedBackground("stadtplan");
              }}
            >
              Standard
            </Button>
            <Button
              style={{ fontSize }}
              variant={
                selectedBackground === "lbk" ? "primary" : "outline-primary"
              }
              onClick={() => {
                // dispatch(setBackground("lbk"));
                setSelectedBackground("lbk");
              }}
            >
              Hybrid
            </Button>
            <Button
              style={{ fontSize }}
              variant={
                selectedBackground === "ortho" ? "primary" : "outline-primary"
              }
              onClick={() => {
                // dispatch(setBackground("ortho"));
                setSelectedBackground("ortho");
              }}
            >
              Satellit
            </Button>
          </ButtonGroup>
        </Form>
        {uiThreadProgressbar === true && (
          <Nav>
            <ProgressBar style={{ width: 200 }} animated now={100} max={100} />
          </Nav>
        )}
        <Nav
          onClick={() => {
            setAppMenuActiveMenuSection("tasks");
            setAppMenuVisible(true);
          }}
        >
          <div key={"taskDiv." + rerenderCount}>
            <span className="fa-layers fa-3x ">
              <Icon
                key={"tasks." + onlineStatus}
                style={{
                  fontSize: fontSizeIconPixel,
                  width: iconWidth,
                  cursor: "pointer",
                  color: onlineStatus ? "#377CF6" : "#dddddd",
                }}
                icon={faShare}
              />
              {numberOfPendingTasks > 0 && (
                <span
                  style={{ backgroundColor: blue[3] }}
                  className="fa-layers-counter  fa-layers-bottom-right"
                >
                  {numberOfPendingTasks}
                </span>
              )}
              {showingGreenCheck && (
                <span
                  style={{ backgroundColor: green[5] }}
                  className="fa-layers-counter  fa-layers-top-right"
                >
                  <Icon icon={faCheck} />
                </span>
              )}
              {numberOfErrorTasks > 0 && (
                <span
                  style={{ backgroundColor: red[3] }}
                  className="fa-layers-counter  fa-layers-top-left"
                >
                  {numberOfErrorTasks}
                </span>
              )}
            </span>
          </div>
        </Nav>
      </Navbar>
    </div>
  );
};
export default BottomNavbar;
const isToday = (someDateMS) => {
  const someDate = new Date(someDateMS);
  const today = new Date();
  return (
    someDate.getDate() === today.getDate() &&
    someDate.getMonth() === today.getMonth() &&
    someDate.getFullYear() === today.getFullYear()
  );
};
