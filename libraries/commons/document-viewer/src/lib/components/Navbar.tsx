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
  maxIndex: number;
  downloadUrl?: string;
  docs: Doc[];
  setWidthTrigger: (trigger: any) => void;
  setHeightTrigger: (trigger: any) => void;
  currentWidthTrigger: any;
  currentHeightTrigger: any;
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
  legacyMode?: boolean;
}

const Navbar = ({
  title,
  maxIndex,
  downloadUrl,
  docs,
  setWidthTrigger,
  setHeightTrigger,
  currentWidthTrigger,
  currentHeightTrigger,
  sidebarCollapsed: externalSidebarCollapsed,
  onSidebarToggle,
  legacyMode = true
}: NavProps) => {
  const { docPackageId, file, page } = useParams();
  const navigate = useNavigate();

  const [internalSidebarCollapsed, setInternalSidebarCollapsed] = useState(true);
  const isCollapsed = legacyMode ? true : externalSidebarCollapsed ?? internalSidebarCollapsed;

  const ZIP_FILE_NAME_MAPPING = {
    bplaene: "BPLAN_Plaene_und_Zusatzdokumente",
    aenderungsv: "FNP_Aenderungsverfahren_und_Zusatzdokumente",
    static: "",
  };

  const DRPROCESSOR = "https://doc-processor.cismet.de";

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

    let zipnamePrefix = ZIP_FILE_NAME_MAPPING["aenderungsv"];
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

  const handleSidebarToggle = () => {
    setInternalSidebarCollapsed(!internalSidebarCollapsed);
    onSidebarToggle?.();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const currentFile = file ? parseInt(file) : 1;
      const currentPage = page ? parseInt(page) : 1;

      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          if (currentPage > 1) {
            navigate(`/docs/${docPackageId}/${file}/${currentPage - 1}`);
          } else {
            if (currentFile > 1 && docs) {
              const previousDoc = docs[currentFile - 2];
              const previousFilePages =
                typeof previousDoc?.meta !== "string" && previousDoc?.meta
                  ? previousDoc.meta.pages ?? 1
                  : 1;

              navigate(
                `/docs/${docPackageId}/${currentFile - 1}/${previousFilePages}`
              );
            } else if (docs) {
              const lastDoc = docs[docs.length - 1];
              const lastFilePages =
                typeof lastDoc?.meta !== "string" && lastDoc?.meta
                  ? lastDoc.meta.pages ?? 1
                  : 1;

              navigate(`/docs/${docPackageId}/${docs.length}/${lastFilePages}`);
            }
          }
          break;

        case "ArrowRight":
          event.preventDefault();
          if (currentPage < maxIndex) {
            navigate(`/docs/${docPackageId}/${file}/${currentPage + 1}`);
          } else if (docs) {
            if (currentFile < docs.length) {
              navigate(`/docs/${docPackageId}/${currentFile + 1}/1`);
            } else {
              navigate(`/docs/${docPackageId}/1/1`);
            }
          }
          break;

        case "ArrowUp":
          event.preventDefault();
          if (currentFile > 1) {
            navigate(`/docs/${docPackageId}/${currentFile - 1}/1`);
          } else if (docs) {
            navigate(`/docs/${docPackageId}/${docs.length}/1`);
          }
          break;

        case "ArrowDown":
          event.preventDefault();
          if (docs && currentFile < docs.length) {
            navigate(`/docs/${docPackageId}/${currentFile + 1}/1`);
          } else {
            navigate(`/docs/${docPackageId}/1/1`);
          }
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
        paddingLeft: "20px",
        paddingRight: "20px",
      }}
      expand="lg"
    >
      <Nav style={{ marginRight: "20px" }}>
        <NavItem>
          {!legacyMode && (
            <div
              className="me-2"
              style={{ cursor: "pointer" }}
              onClick={onSidebarToggle}
            >
              <FontAwesomeIcon
                icon={isCollapsed ? "chevron-circle-right" : "chevron-circle-left"}
                size="lg"
              />
            </div>
          )}
        </NavItem>
      </Nav>
      <div
        style={{
          width: "46%",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
        }}
      >
        <BootstrapNavbar.Brand>
          <a style={{ color: "grey", marginRight: "10px" }}>{title}</a>
        </BootstrapNavbar.Brand>
        <BootstrapNavbar.Collapse>
          <Nav style={{ marginRight: "20px" }}>
            <NavItem>
              <OverlayTrigger
                key={"bottom"}
                placement="bottom"
                overlay={<Tooltip id="">vorherige Seite</Tooltip>}
              >
                <button
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    outline: "inherit",
                    marginRight: "24px",
                  }}
                  className="navItem"
                  onClick={() => {
                    if (page && file)
                      if (parseInt(page) > 1) {
                        navigate(
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

                          navigate(
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

                          navigate(
                            `/docs/${docPackageId}/${docs.length}/${lastFilePages}`
                          );
                        }
                      }
                  }}
                >
                  <Icon name="chevron-left" />
                </button>
              </OverlayTrigger>
            </NavItem>
            <NavItem>
              {page} / {maxIndex}
            </NavItem>
            <NavItem>
              <OverlayTrigger
                key={"bottom"}
                placement="bottom"
                overlay={<Tooltip id="">nächste Seite</Tooltip>}
              >
                <button
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    outline: "inherit",
                    marginLeft: "20px",
                  }}
                  className="navItem"
                  onClick={() => {
                    if (page && file)
                      if (parseInt(page) < maxIndex) {
                        navigate(
                          `/docs/${docPackageId}/${file}/${parseInt(page) + 1}`
                        );
                      } else {
                        if (parseInt(file) < docs.length) {
                          navigate(
                            `/docs/${docPackageId}/${parseInt(file) + 1}/1`
                          );
                        } else {
                          navigate(`/docs/${docPackageId}/1/1`);
                        }
                      }
                  }}
                >
                  <Icon name="chevron-right" />
                </button>
              </OverlayTrigger>
            </NavItem>
          </Nav>
          <BootstrapNavbar.Text>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          </BootstrapNavbar.Text>
          <Nav className="mr-auto">
            <NavItem>
              <OverlayTrigger
                key={"bottom"}
                placement="bottom"
                overlay={<Tooltip id="">an Fensterbreite anpassen</Tooltip>}
              >
                <button
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    outline: "inherit",
                    marginRight: "20px",
                  }}
                  className="navItem"
                  onClick={() => {
                    if (currentWidthTrigger) {
                      setWidthTrigger(currentWidthTrigger + 1);
                    } else {
                      setWidthTrigger(1);
                    }
                  }}
                >
                  <Icon name="arrows-h" />
                </button>
              </OverlayTrigger>
            </NavItem>
            <NavItem>
              <OverlayTrigger
                key={"bottom"}
                placement="bottom"
                overlay={<Tooltip id="">an Fensterhöhe anpassen</Tooltip>}
              >
                <button
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    outline: "inherit",
                  }}
                  className="navItem"
                  onClick={() => {
                    if (currentHeightTrigger) {
                      setHeightTrigger(currentHeightTrigger + 1);
                    } else {
                      setHeightTrigger(1);
                    }
                  }}
                >
                  <Icon name="arrows-v" />
                </button>
              </OverlayTrigger>
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
