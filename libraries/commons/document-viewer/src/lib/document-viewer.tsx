import { useEffect, useRef, useState } from "react";
import Navbar from "./components/Navbar";
import Sidebar, { SIDEBAR_BACKGROUND_COLOR } from "./components/Sidebar";
import DocMap from "./components/DocMap";
import { useParams, useNavigate } from "react-router-dom";
import { Alert } from "react-bootstrap";
import Icon from "react-cismap/commons/Icon";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "leaflet/dist/leaflet.css";

const NARROW_SCREEN_THRESHOLD = 800; // Width in pixels when sidebar auto-collapses

export type layer = {
  [key: string]: {
    x: number;
    y: number;
    maxZoom: number;
  };
};

type MetaLayer = {
  x: number;
  y: number;
  maxZoom: number;
};

export type Doc = {
  url: string;
  layer: string;
  title?: string;
  docTitle?: string;
  group: string;
  file: string;
  structure?: string;
  metaUrl?: string;
  primary?: boolean;
  meta?:
    | {
        [key: `layer${number}`]: MetaLayer | undefined;
        pages: number;
        _theend: number;
        contentLength: string;
        lastModified?: string;
      }
    | string;
};

/* eslint-disable-next-line */
export interface DocumentViewerProps {
  title?: string;
  docs: Doc[];
  mode: string;
  initialSidebarCollapsed?: boolean;
  collapsible?: boolean;
  initialCollapsed?: boolean;
  dynamicPrefixDetection?: boolean;
  improveReadabilityOfDocTitles?: boolean;
}

export function DocumentViewer({
  title,
  docs,
  mode,
  initialSidebarCollapsed = false,
  collapsible = true,
  initialCollapsed = true,
  dynamicPrefixDetection = true,
  improveReadabilityOfDocTitles = true,
}: DocumentViewerProps) {
  const debugDocs = JSON.parse(JSON.stringify(docs));
  for (const dd of debugDocs) {
    delete dd.meta;
  }

  let { file } = useParams();
  const routerNavigate = useNavigate();
  const collapsedSidebarWidth = 220;
  const expandedSidebarWidth = 335;
  const sideBarMinSize = 130;
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const [wholeWidthTrigger, setWholeWidthTrigger] = useState(undefined);
  const [wholeHeightTrigger, setWholeHeightTrigger] = useState(undefined);
  const [mapWidth, setMapWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [userPreferredCollapsed, setUserPreferredCollapsed] = useState(
    initialSidebarCollapsed
  );
  const [isNarrowScreen, setIsNarrowScreen] = useState(
    window.innerWidth < NARROW_SCREEN_THRESHOLD
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    initialSidebarCollapsed
  );
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);

  useEffect(() => {
    const handleResize = () => {
      const narrow = window.innerWidth < NARROW_SCREEN_THRESHOLD;
      setIsNarrowScreen(narrow);
      setSidebarCollapsed(narrow ? true : userPreferredCollapsed);
    };

    window.addEventListener("resize", handleResize);
    handleResize(); // Initial check
    return () => window.removeEventListener("resize", handleResize);
  }, [userPreferredCollapsed]);

  const handleSidebarToggle = () => {
    if (!isNarrowScreen) {
      const newState = !sidebarCollapsed;
      setUserPreferredCollapsed(newState);
      setSidebarCollapsed(newState);
    }
  };

  let problemWithDocPreviewAlert: JSX.Element | null = null;
  // @ts-expect-error type is wrong
  const pages = docs[parseInt(file!) - 1]?.meta?.pages
    ? // @ts-expect-error type is wrong
      docs[parseInt(file!) - 1]?.meta?.pages
    : 0;

  if (!pages) {
    problemWithDocPreviewAlert = (
      <div
        style={{
          zIndex: 234098,
          left: "40%",
          top: "30%",
          width: "fit-content",
          height: "fit-content",
          textAlign: "center",
          position: "absolute",
        }}
      >
        <Alert style={{ width: "100%" }} variant="primary">
          <h4>Vorschau nicht verfügbar.</h4>
          <p>
            Im Moment kann die Vorschau des Dokumentes nicht angezeigt werden.
            Sie können das Dokument aber{" "}
            <a
              href={docs[parseInt(file!) - 1]?.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              hier <Icon name="download" />
            </a>{" "}
            herunterladen.
          </p>
        </Alert>
      </div>
    );
  }

  const mapHeight = "calc(100vh - 49px)";

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isNarrowScreen) return; // Prevent resizing in narrow screen mode
    isResizingRef.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizingRef.current || isNarrowScreen) return; // Also check narrow screen here
    const newWidth = e.clientX;
    if (newWidth >= sideBarMinSize && newWidth <= expandedSidebarWidth) {
      setMapWidth(newWidth);
    }
  };

  const handleMouseUp = () => {
    isResizingRef.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    if (mapWrapperRef.current) {
      setHeight(mapWrapperRef.current.clientHeight);
    }
  }, [mapWrapperRef]);

  useEffect(() => {
    if (sidebarRef.current) {
      sidebarRef.current.style.width = `${
        sidebarCollapsed ? collapsedSidebarWidth : expandedSidebarWidth
      }px`;
    }
  }, [sidebarCollapsed]);

  return (
    <div style={{ background: "#343a40", height: "100vh" }}>
      <div
        style={{
          backgroundImage: "linear-gradient(to bottom, #3c3c3c 0, #222 100%)",
        }}
      >
        <Navbar
          title={title || docs[0]?.title}
          maxIndex={pages}
          downloadUrl={docs[parseInt(file!) - 1]?.url}
          docs={docs}
          setWidthTrigger={setWholeWidthTrigger}
          setHeightTrigger={setWholeHeightTrigger}
          currentWidthTrigger={wholeWidthTrigger}
          currentHeightTrigger={wholeHeightTrigger}
          sidebarCollapsed={sidebarCollapsed}
          collapsedSidebarWidth={isNarrowScreen ? 10 : collapsedSidebarWidth}
          expandedSidebarWidth={isNarrowScreen ? 10 : expandedSidebarWidth}
          index={parseInt(file!) - 1}
          navigate={(page: number) => {
            const docPackageId = window.location.pathname.split("/")[2];
            const currentFile = parseInt(file!);
            routerNavigate(`/docs/${docPackageId}/${currentFile}/${page}`);
          }}
          rightPadding={isNarrowScreen ? 10 : 50}
          mode={mode}
        />
      </div>

      <div
        style={{
          height: mapHeight,
          background: "grey",
          display: "flex",
          flexDirection: "row",
          flexWrap: "nowrap",
          justifyContent: "flex-start",
          alignItems: "flex-start",
          alignContent: "center",
        }}
      >
        {docs.length > 1 && (
          <>
            <div
              id="sidebar"
              style={{
                background: SIDEBAR_BACKGROUND_COLOR,
                height: mapHeight,
                padding: "5px 5px 5px 5px",
                overflow: "scroll",
              }}
              ref={sidebarRef}
            >
              <Sidebar
                docs={docs}
                index={parseInt(file!)}
                maxIndex={pages}
                mode={mode}
                compactView={sidebarCollapsed}
                collapsible={collapsible}
                initialCollapsed={initialCollapsed}
                dynamicPrefixDetection={dynamicPrefixDetection}
                improveReadabilityOfDocTitles={improveReadabilityOfDocTitles}
                isNarrowScreen={isNarrowScreen}
                onToggle={handleSidebarToggle}
              />
            </div>
            <div style={{ position: "relative" }}>
              <button
                style={{
                  position: "absolute",
                  right: "-7.5px",
                  top: "-15px",
                  background: "none",
                  border: "none",
                  padding: 0,
                  outline: "inherit",
                  zIndex: 1000,
                  cursor: "pointer",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onClick={handleSidebarToggle}
              >
                <FontAwesomeIcon
                  icon={
                    sidebarCollapsed
                      ? "chevron-circle-right"
                      : "chevron-circle-left"
                  }
                  style={{
                    color: "#666",
                    fontSize: "20px",
                    backgroundColor: "white",
                    borderRadius: "50%",
                    boxShadow: "0 0 2px rgba(0,0,0,0.2)",
                  }}
                />
              </button>
              <div
                id="sidebar-slider"
                style={{
                  background: "#999999",
                  height: mapHeight,
                  width: 5,
                  cursor: "col-resize",
                }}
                onMouseDown={handleMouseDown}
              ></div>
            </div>
          </>
        )}
        <div
          id="docviewer"
          style={{
            height: mapHeight,
            width: "100%",
          }}
          ref={mapWrapperRef}
        >
          {docs.length > 1 && problemWithDocPreviewAlert}
          <DocMap
            docs={docs}
            index={parseInt(file!)}
            height={height}
            width={mapWidth}
            setWholeHeight={wholeHeightTrigger}
            setWholeWidth={wholeWidthTrigger}
          />
        </div>
      </div>
    </div>
  );
}

export default DocumentViewer;
