import {
  Navbar as BootstrapNavbar,
  Nav,
  NavItem,
  Tooltip,
  OverlayTrigger,
} from "react-bootstrap";
import Icon from "react-cismap/commons/Icon";
import { useNavigate, useParams } from "react-router-dom";
import type { Doc } from "../document-viewer";
import "./navItem.css";
import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface NavProps {
  title?: string;
  docs: Doc[];
  maxIndex: number;
  index: number;
  navigate: (page: number) => void;
  sidebarCollapsed: boolean;
  collapsedSidebarWidth: number;
  expandedSidebarWidth: number;
  downloadUrl?: string;
  setWidthTrigger: any;
  setHeightTrigger: any;
  currentWidthTrigger?: number;
  currentHeightTrigger?: number;
  rightPadding?: number;
  mode: string;
}

const NARROW_SCREEN_THRESHOLD = 768;

const Navbar = ({
  title,
  docs,
  maxIndex,
  index,
  navigate,
  sidebarCollapsed,
  collapsedSidebarWidth,
  expandedSidebarWidth,
  downloadUrl,
  setWidthTrigger,
  setHeightTrigger,
  currentWidthTrigger,
  currentHeightTrigger,
  rightPadding = 50,
  mode,
}: NavProps) => {
  const { file } = useParams();
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipText, setTooltipText] = useState("");
  const [tooltipId, setTooltipId] = useState("");
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipTarget, setTooltipTarget] = useState<any>(null);
  const routerNavigate = useNavigate();

  const handleTooltipMouseEnter = (
    text: string,
    id: string,
    event: React.MouseEvent
  ) => {
    setTooltipText(text);
    setTooltipId(id);
    setTooltipTarget(event.target);
    setTooltipVisible(true);
  };

  const handleTooltipMouseLeave = () => {
    setTooltipVisible(false);
  };

  const { docPackageId, page } = useParams();

  const ZIP_FILE_NAME_MAPPING = {
    bplaene: "BPLAN_Plaene_und_Zusatzdokumente",
    aenderungsv: "FNP_Aenderungsverfahren_und_Zusatzdokumente",
    static: "",
  };

  const DRPROCESSOR = "https://doc-processor.cismet.de";
  // const DRPROCESSOR = "http://localhost:8081";

  const downloadSingleFile = (downloadOptions: any) => {
    try {
      let link = document.createElement("a");
      document.body.appendChild(link);
      link.setAttribute("type", "hidden");
      link.href = downloadOptions.url;
      link.target = "_blank";
      link.click();
    } catch (err) {
      window.alert(err);
    }
  };

  const prepareDownloadMultipleFiles = (mergeConf: any) => {
    fetch(DRPROCESSOR + "/api/zip/and/wait/for/status", {
      method: "post",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mergeConf),
    })
      .then((response) => {
        if (response.status >= 200 && response.status < 300) {
          return response.json();
        } else {
          console.log(
            "Error:" + response.status + " -> " + response.statusText
          );
        }
      })
      .catch((e) => {
        console.log(e);
      })
      .then((result) => {
        if (result && !result.error) {
          downloadSingleFile({
            file: mergeConf.name + ".zip",
            url:
              DRPROCESSOR +
              "/api/download/zip/" +
              result.id +
              "/" +
              mergeConf.name,
          });
        }
      });
  };

  const downloadEverything = (docs: Doc[]) => {
    let encoding: any = null;
    if (navigator.appVersion.indexOf("Win") !== -1) {
      encoding = "CP850";
    }

    let zipnamePrefix = ZIP_FILE_NAME_MAPPING[mode];
    if (zipnamePrefix === undefined) {
      zipnamePrefix = "Archiv.";
    } else if (zipnamePrefix !== "") {
      zipnamePrefix = zipnamePrefix + ".";
    }

    let downloadConf: {
      name: string;
      files: unknown[];
      encoding: string;
    } = {
      name: zipnamePrefix + docPackageId,
      files: [],
      encoding: encoding,
    };
    for (const doc of docs) {
      downloadConf.files.push({
        uri: doc.url,
        folder: doc.group,
      });
    }
    prepareDownloadMultipleFiles(downloadConf);
  };

  const [isNarrowScreen, setIsNarrowScreen] = useState(window.innerWidth < 800);

  useEffect(() => {
    const handleResize = () => {
      setIsNarrowScreen(window.innerWidth < 800);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!page || !file) return;

      const currentPage = parseInt(page, 10);
      const currentFile = parseInt(file, 10);

      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          // Decrement page or navigate to the last page of the previous document
          if (currentPage > 1) {
            routerNavigate(`/docs/${docPackageId}/${file}/${currentPage - 1}`);
          } else {
            if (currentFile > 1) {
              const previousDoc = docs[currentFile - 2];
              const previousFilePages =
                typeof previousDoc?.meta !== "string" && previousDoc?.meta
                  ? previousDoc.meta.pages ?? 1
                  : 1;

              routerNavigate(
                `/docs/${docPackageId}/${currentFile - 1}/${previousFilePages}`
              );
            } else {
              const lastDoc = docs[docs.length - 1];
              const lastFilePages =
                typeof lastDoc?.meta !== "string" && lastDoc?.meta
                  ? lastDoc.meta.pages ?? 1
                  : 1;

              routerNavigate(
                `/docs/${docPackageId}/${docs.length}/${lastFilePages}`
              );
            }
          }
          break;

        case "ArrowRight":
          event.preventDefault();
          // Increment page or navigate to the first page of the next document
          if (currentPage < maxIndex) {
            routerNavigate(`/docs/${docPackageId}/${file}/${currentPage + 1}`);
          } else {
            if (currentFile < docs.length) {
              routerNavigate(`/docs/${docPackageId}/${currentFile + 1}/1`);
            } else {
              routerNavigate(`/docs/${docPackageId}/1/1`);
            }
          }
          break;

        case "ArrowUp":
          event.preventDefault();
          // Navigate to the first page of the previous document
          if (currentFile > 1) {
            routerNavigate(`/docs/${docPackageId}/${currentFile - 1}/1`);
          } else {
            routerNavigate(`/docs/${docPackageId}/${docs.length}/1`);
          }
          break;

        case "ArrowDown":
          event.preventDefault();
          // Navigate to the first page of the next document
          if (currentFile < docs.length) {
            routerNavigate(`/docs/${docPackageId}/${currentFile + 1}/1`);
          } else {
            routerNavigate(`/docs/${docPackageId}/1/1`);
          }
          break;

        default:
          break;
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [navigate, docPackageId, file, page, docs, maxIndex]);

  return (
    <BootstrapNavbar
      style={{
        marginBottom: 0,
        width: "100%",
        color: "grey",
        paddingLeft: sidebarCollapsed
          ? `${collapsedSidebarWidth}px`
          : `${expandedSidebarWidth}px`,
        paddingRight: `${rightPadding}px`,
      }}
      expand={true}
      className="document-viewer-navbar"
    >
      <style>
        {`
          @media (max-width: 800px) {
            .document-viewer-navbar.navbar {
              padding-left: 10px !important;
            }
          }
        `}
      </style>
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          whiteSpace: "nowrap",
        }}
      >
        <BootstrapNavbar.Brand>
          <a style={{ color: "grey", marginRight: "10px" }}>{title}</a>
        </BootstrapNavbar.Brand>
        <BootstrapNavbar.Collapse style={{ display: "flex !important" }}>
          <Nav style={{ marginRight: "20px" }}>
            <NavItem>
              <button
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  outline: "inherit",
                  marginRight: "24px",
                }}
                className="navItem"
                title="vorherige Seite"
                onClick={() => {
                  if (page && file)
                    if (parseInt(page) > 1) {
                      routerNavigate(
                        `/docs/${docPackageId}/${file}/${parseInt(page) - 1}`
                      );
                    } else {
                      if (parseInt(file) > 1) {
                        const previousDoc = docs[parseInt(file) - 1 - 1];
                        const previousFilePages =
                          typeof previousDoc.meta !== "string" &&
                          previousDoc.meta
                            ? previousDoc.meta.pages ?? 1
                            : 1;

                        routerNavigate(
                          `/docs/${docPackageId}/${
                            parseInt(file) - 1
                          }/${previousFilePages}`
                        );
                      } else {
                        const lastDoc = docs[docs.length - 1];
                        const lastFilePages =
                          typeof lastDoc.meta !== "string" && lastDoc.meta
                            ? lastDoc.meta.pages ?? 1
                            : 1;

                        routerNavigate(
                          `/docs/${docPackageId}/${docs.length}/${lastFilePages}`
                        );
                      }
                    }
                }}
              >
                <Icon name="chevron-left" />
              </button>
            </NavItem>
            <NavItem>
              {page} / {maxIndex}
            </NavItem>
            <NavItem>
              <button
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  outline: "inherit",
                  marginLeft: "20px",
                }}
                className="navItem"
                title="nächste Seite"
                onClick={() => {
                  if (page && file)
                    if (parseInt(page) < maxIndex) {
                      routerNavigate(
                        `/docs/${docPackageId}/${file}/${parseInt(page) + 1}`
                      );
                    } else {
                      if (parseInt(file) < docs.length) {
                        routerNavigate(
                          `/docs/${docPackageId}/${parseInt(file) + 1}/1`
                        );
                      } else {
                        routerNavigate(`/docs/${docPackageId}/1/1`);
                      }
                    }
                }}
              >
                <Icon name="chevron-right" />
              </button>
            </NavItem>
          </Nav>
          <BootstrapNavbar.Text>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          </BootstrapNavbar.Text>
          <Nav className="mr-auto">
            <NavItem>
              <a
                style={{ marginRight: "20px" }}
                className="navItem"
                onClick={() => {
                  if (currentWidthTrigger) {
                    setWidthTrigger(currentWidthTrigger + 1);
                  } else {
                    setWidthTrigger(1);
                  }
                }}
                title="an Fensterbreite anpassen"
              >
                <Icon name="arrows-h" />
              </a>
            </NavItem>
            <NavItem>
              <a
                style={{ marginRight: "20px" }}
                className="navItem"
                onClick={() => {
                  if (currentHeightTrigger) {
                    setHeightTrigger(currentHeightTrigger + 1);
                  } else {
                    setHeightTrigger(1);
                  }
                }}
                title="an Fensterhöhe anpassen"
              >
                <Icon name="arrows-v" />
              </a>
            </NavItem>
          </Nav>
          <Nav
            style={{
              display: "flex",
              gap: 20,
            }}
          >
            <NavItem>
              <a
                href={downloadUrl}
                download
                className="navItem"
                target="_blank"
                title="Dokument herunterladen (pdf)"
              >
                <Icon name="download" />
              </a>
            </NavItem>
            <NavItem>
              <button
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: docs.length < 2 ? "auto" : "pointer",
                  outline: "inherit",
                }}
                title="alles herunterladen (zip)"
                className="navItem"
                disabled={docs.length < 2}
                onClick={() => {
                  downloadEverything(docs);
                }}
              >
                <Icon name="file-archive-o" />
              </button>
            </NavItem>
            <NavItem>
              <button
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,

                  outline: "inherit",
                }}
                className="navItem"
                disabled={true}
              >
                <Icon name="question-circle" />
              </button>
            </NavItem>
          </Nav>
        </BootstrapNavbar.Collapse>
      </div>
    </BootstrapNavbar>
  );
};

export default Navbar;
