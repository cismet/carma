import { Excalidraw, MainMenu, exportToCanvas } from "@excalidraw/excalidraw";
import { useEffect, useState, useRef } from "react";
import "./designer-style.css";
import { Input, Collapse, Divider } from "antd";
import {
  SearchOutlined,
  DeleteOutlined,
  CameraOutlined,
} from "@ant-design/icons";
import signLocal from "./signLocal.json";
import {
  CloseOutlined,
  UnorderedListOutlined,
  AppstoreOutlined,
  BookOutlined,
} from "@ant-design/icons";
import { libraryExtractor } from "./libraryExtractor";
import { nanoid } from "nanoid";

const colorPrimary = "#6965db";
const colorInactiv = "#a5a5a5";
const colorTextBlack = "#1b1b1f";
const iconWrapperSize = {
  width: "28px",
  aspectRatio: "1/1",
  padding: "8px",
  boxSizing: "content-box",
  border: "1px solid #ECECF4",
  position: "relative",
};

const singleIconStyInternalStyle = {
  maxWidth: "38px",
  position: "absolute",
  maxHeight: "38px",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
};
const iconWrapperSizeWithDescription = {
  flex: "0 0 28",
  minWidth: "28px",
  height: "28px",
  boxSizing: "content-box",
  padding: "8px",
  border: "1px solid #ECECF4",
  position: "relative",
};
const singleIconStyInternalStyleWithDescription = {
  maxWidth: "38px",
  position: "absolute",
  maxHeight: "38px",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
};
const libraryTitle = {
  fontFamily: "Assistant, Helvetica, Roboto, Arial",
  fontSize: "20px",
  color: colorPrimary,
  fontWeight: "bold",
};
const sectionTitleStyle = {
  fontFamily: "Assistant, Helvetica, Roboto, Arial",
  fontSize: "15px",
  color: colorPrimary,
  fontWeight: "bold",
};

const titleGroupStyle = {
  fontFamily: "Assistant, Helvetica, Roboto, Arial",
  color: "#525252",
  lineHeight: "1.4em",
};

const onChangeCollapseHandle = (key) => {
  console.log(key);
};

const labelView = (group, groupItems = null) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      width: "100%",
      color: colorTextBlack,
    }}
  >
    <span style={titleGroupStyle}>{group.groupTitle}</span>
    <span style={{ fontSize: "12px", color: colorInactiv }}>
      {groupItems ? groupItems : group.iconsArr.length}
    </span>
  </div>
);

const DesignerWrapper = ({
  dataIn: signLibrary = signLocal, // rename to signLibrary
  extractor = libraryExtractor,
  viewOnlyMode = false,
  getElements = (elements) => {},
  getFiles = () => {},
  initialElements,
  getPreviewSrcLink = () => {},
  resetDrawing,
}) => {
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  const [data, setData] = useState([]);
  const canvasWrapperRef = useRef(null);
  const [viewMode, setViewMode] = useState(viewOnlyMode);
  const [canvasUrl, setCanvasUrl] = useState(null);
  useEffect(() => {
    if (excalidrawAPI) {
      setData(extractor(signLibrary));
    }
  }, [signLibrary, excalidrawAPI]);

  const fetchIcon = async (pathName, fileId) => {
    const res = await fetch(pathName);

    const imageData = await res.blob();
    const reader = new FileReader();
    reader.readAsDataURL(imageData);

    reader.onload = function () {
      const imagesArray = [
        {
          id: fileId,
          dataURL: reader.result,
          mimeType: "image/svg+xml",
        },
      ];
      excalidrawAPI.addFiles(imagesArray);
    };
  };
  const UIOptions = {
    canvasActions: {
      saveAsImage: false,
    },
  };
  const [showLibrary, setShowLibrary] = useState(!viewOnlyMode);
  const [onlyIconMode, setOnlyIconMode] = useState(true);
  const [itemsOnlyIcon, setItemsOnlyIcon] = useState();
  const [itemsWithTextDescription, setItemsWithTextDescription] = useState();
  const [isPinnedLibrary, setIsPinnedLibrary] = useState(true);

  const [searchText, setSearchText] = useState("");

  const [filteredData, setFilteredData] = useState([]);
  const [filteredDataOnlyIcon, setFilteredDataOnlyIcon] = useState({});
  const [filteredDataIconDescription, setFilteredDataIconDescription] =
    useState({});

  const handleUpdateCanvas = async (event) => {
    const naturalWidth = event.target.naturalWidth;
    const naturalHeight = event.target.naturalHeight;
    const iconPath = event.target.getAttribute("src");
    const pathName = iconPath;
    const newFileId = nanoid();

    const excalidrawState = excalidrawAPI.getAppState();

    const centerX = canvasWrapperRef.current.clientWidth / 2;
    const centerY = canvasWrapperRef.current.clientHeight / 2;

    const newElement = {
      type: "image",
      isDeleted: false,
      id: nanoid(),
      fillStyle: "hachure",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      angle: 0,
      x: centerX,
      y: centerY,
      strokeColor: "#c92a2a",
      backgroundColor: "transparent",
      width: naturalWidth / 6,
      height: naturalHeight / 6,
      groupIds: [],
      boundElements: null,
      locked: false,
      link: null,
      fileId: newFileId,
    };

    const getSceneElements = excalidrawAPI.getSceneElements();

    excalidrawAPI.updateScene({
      elements: [...getSceneElements, newElement],
      appState: excalidrawState,
    });
    await fetchIcon(pathName, newFileId);
  };

  const generatePreviewHandler = async () => {
    const exportCanvas = await exportToCanvas({
      elements: excalidrawAPI.getSceneElements(),
      appState: excalidrawAPI.getAppState(),
      getDimensions: () => {
        return {
          width: canvasWrapperRef.current.clientWidth,
          height: canvasWrapperRef.current.clientHeight,
        };
      },
      files: excalidrawAPI.getFiles(),
    });
    setCanvasUrl(exportCanvas.toDataURL());
    getPreviewSrcLink(exportCanvas.toDataURL());
  };

  useEffect(() => {
    generatePreviewHandler();
  }, [resetDrawing]);

  useEffect(() => {
    const compsWithTextDescription = {};
    const compsOnlyIcons = {};
    data.forEach((section) => {
      compsWithTextDescription[section.sectionTitle] = [];
      compsOnlyIcons[section.sectionTitle] = [];
      section.groups.forEach((g) => {
        const id = g.id;
        const label = labelView(g);
        const onlyIconObj = {
          id,
          label,
          children: onlyIconView(g.iconsArr),
        };
        compsOnlyIcons[section.sectionTitle].push(onlyIconObj);
        const iconWithDescriptionObj = {
          id,
          label,
          children: iconWithDescriptionView(g.iconsArr),
        };

        compsWithTextDescription[section.sectionTitle].push(
          iconWithDescriptionObj
        );
      });
    });

    setItemsOnlyIcon(compsOnlyIcons);
    setItemsWithTextDescription(compsWithTextDescription);
  }, [data]);

  useEffect(() => {
    if (searchText !== "") {
      const compsWithTextDescription = {};
      const compsOnlyIcons = {};

      data.forEach((section) => {
        compsWithTextDescription[section.sectionTitle] = [];
        compsOnlyIcons[section.sectionTitle] = [];

        if (
          !section.sectionTitle.toLowerCase().includes(searchText.toLowerCase())
        ) {
          section.groups.forEach((group) => {
            if (
              !group.groupTitle.toLowerCase().includes(searchText.toLowerCase())
            ) {
              const searchTermIcons = group.iconsArr.filter((icon) => {
                const idString = icon.id ? icon.id : "";
                return (
                  icon.iconsTitle
                    .toLowerCase()
                    .includes(searchText.toLowerCase()) ||
                  idString.toLowerCase().includes(searchText.toLowerCase())
                );
              });

              if (searchTermIcons.length !== 0) {
                const id = group.id;
                const label = labelView(group, searchTermIcons.length);
                const onlyIconObj = {
                  id,
                  label,
                  children: onlyIconView(searchTermIcons),
                };
                compsOnlyIcons[section.sectionTitle].push(onlyIconObj);

                const iconWithDescriptionObj = {
                  id,
                  label,
                  children: iconWithDescriptionView(searchTermIcons),
                };

                compsWithTextDescription[section.sectionTitle].push(
                  iconWithDescriptionObj
                );
              }
            } else {
              const id = group.id;
              const label = labelView(group);
              const onlyIconObj = {
                id,
                label,
                children: onlyIconView(group.iconsArr),
              };
              compsOnlyIcons[section.sectionTitle].push(onlyIconObj);
              const iconWithDescriptionObj = {
                id,
                label,
                children: iconWithDescriptionView(group.iconsArr),
              };
              compsWithTextDescription[section.sectionTitle].push(
                iconWithDescriptionObj
              );
            }
          });
        } else {
          compsWithTextDescription[section.sectionTitle] = [];
          compsOnlyIcons[section.sectionTitle] = [];
          section.groups.forEach((g) => {
            const id = g.id;
            const label = labelView(g);
            const onlyIconObj = {
              id,
              label,
              children: onlyIconView(g.iconsArr),
            };
            compsOnlyIcons[section.sectionTitle].push(onlyIconObj);
            const iconWithDescriptionObj = {
              id,
              label,
              children: iconWithDescriptionView(g.iconsArr),
            };

            compsWithTextDescription[section.sectionTitle].push(
              iconWithDescriptionObj
            );
          });
        }
      });

      const dataFiltered = Object.keys(compsOnlyIcons).filter(
        (sectionName) => compsOnlyIcons[sectionName].length > 0
      );

      setFilteredData(dataFiltered);
      setFilteredDataOnlyIcon(compsOnlyIcons);
      setFilteredDataIconDescription(compsWithTextDescription);
    }
  }, [searchText]);

  const onlyIconView = (iconsData) => {
    return (
      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          marginRight: "-18px",
        }}
      >
        {iconsData.map((icon) => (
          <div key={icon.iconId} style={iconWrapperSize}>
            <img
              src={icon.fileName}
              style={singleIconStyInternalStyle}
              onClick={handleUpdateCanvas}
            />
          </div>
        ))}
      </div>
    );
  };

  const iconWithDescriptionView = (iconsData) => {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          color: colorTextBlack,
        }}
      >
        {iconsData.map((icon) => (
          <div
            style={{ display: "flex", gap: "10px", alignItems: "center" }}
            key={icon.iconId}
          >
            <div style={iconWrapperSizeWithDescription}>
              <img
                src={icon.fileName}
                style={singleIconStyInternalStyleWithDescription}
                onClick={handleUpdateCanvas}
              />
            </div>
            <span style={{ fontSize: "13px", lineHeight: "1.3em" }}>
              {icon.iconsTitle}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div
        className={`excalidraw-custom-wrapper ${
          viewMode ? "only-view-mode" : ""
        }`}
        style={{
          height: "700px",
          display: "flex",
        }}
      >
        <div className="w-full" ref={canvasWrapperRef}>
          <Excalidraw
            excalidrawAPI={(api) => setExcalidrawAPI(api)}
            UIOptions={UIOptions}
            onChange={(elements, appstate, files) => {
              getElements(elements);
              getFiles(files);
            }}
            initialData={initialElements}
            langCode="de-DE"
            viewModeEnabled={viewMode}
            zenModeEnabled={viewMode}
            renderTopRightUI={() => {
              return (
                <div
                  style={{
                    background: "#ECECF4",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    padding: "10.5px",
                    borderRadius: "9px",
                    width: "80px",
                    color: "#5B5B60",
                    fontSize: "12px",
                    cursor: "pointer",
                    boxSizing: "content-box",
                  }}
                  onClick={() => setShowLibrary(!showLibrary)}
                >
                  <BookOutlined />
                  <span style={{ marginLeft: "10px" }}>Bibliothek</span>
                </div>
              );
            }}
          >
            <MainMenu style={{ width: "500px" }}>
              <MainMenu.DefaultItems.Export />
              <MainMenu.Item
                onSelect={generatePreviewHandler}
                icon={
                  <CameraOutlined
                    style={{ fontSize: "8px", color: "#5B5B60" }}
                  />
                }
              >
                <span>Vorschau erstellen</span>
              </MainMenu.Item>
              {!viewMode && (
                <>
                  <MainMenu.DefaultItems.Help />
                  <MainMenu.DefaultItems.LoadScene />
                  <MainMenu.Item
                    onSelect={() => {
                      excalidrawAPI.resetScene();
                    }}
                    icon={
                      <DeleteOutlined
                        style={{ fontSize: "8px", color: "#5B5B60" }}
                      />
                    }
                  >
                    <span>Zeichenfläche löschen</span>
                  </MainMenu.Item>
                  <Divider />
                </>
              )}
              <MainMenu.DefaultItems.ChangeCanvasBackground />
            </MainMenu>
          </Excalidraw>
        </div>
        <div
          style={{
            display: isPinnedLibrary ? "block" : "none",
          }}
        >
          {showLibrary ? (
            <div
              style={{
                margin: "15px 0 12px 4px",
                width: "338px",
                border: "1px solid #F0F0F0",
                padding: "10px 20px",
                boxShadow: "rgba(15, 14, 15, 0.07) 4px 1px 9px 1px",
                borderRadius: "12px",
                overflow: "auto",
                height: "650px",
                color: "#1b1b1f",
                boxSizing: "content-box",
              }}
            >
              <div style={{ margin: "16px 0" }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span style={libraryTitle}>Bibliothek</span>
                  <div style={{ marginLeft: "auto" }}>
                    {/* <PushpinOutlined
                      style={{
                        color: "#a5a5a5",
                        fontSize: "16px",
                        fontWeight: "bold",
                        marginRight: "12px",
                      }}
                      onClick={() => setIsPinnedLibrary(false)}
                    /> */}
                    <AppstoreOutlined
                      style={{
                        color: !onlyIconMode && colorInactiv,
                        marginRight: "10px",
                      }}
                      onClick={() => {
                        setOnlyIconMode(true);
                      }}
                    />

                    <UnorderedListOutlined
                      onClick={() => {
                        setOnlyIconMode(false);
                      }}
                      style={{
                        color: onlyIconMode && colorInactiv,
                        marginRight: "10px",
                      }}
                    />

                    <CloseOutlined
                      onClick={() => setShowLibrary(!showLibrary)}
                      style={{
                        // color: colorPrimary,
                        fontSize: "16px",
                        fontWeight: "medium",
                        color: "#1b1b1f",
                      }}
                    />
                  </div>
                </div>
                <Divider style={{ margin: "22px 0px" }} />
                <div style={{ margin: "15px 0px" }}>
                  {/* <span style={libraryTitle}>Suche</span> */}
                  <Input
                    size="large"
                    prefix={<SearchOutlined />}
                    allowClear
                    onPressEnter={(e) => {
                      console.log("yyy on Press enter");
                      setSearchText(e.target.value);
                    }}
                    placeholder="Hier nach Beschreibung und Nr filtern"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{
                      height: "40px",
                      marginTop: "8px",
                      marginBottom: "15px",
                      fontSize: "14px",
                    }}
                  />
                  {searchText === ""
                    ? data.map((section) => {
                        return (
                          <div
                            style={{ margin: "12px 0px 0px 0px" }}
                            key={section.sectionTitle}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: "6px",
                              }}
                            >
                              <span style={sectionTitleStyle}>
                                {section.sectionTitle}
                              </span>
                            </div>
                            <Collapse
                              items={
                                onlyIconMode
                                  ? itemsOnlyIcon[section.sectionTitle]
                                  : itemsWithTextDescription[
                                      section.sectionTitle
                                    ]
                              }
                              ghost
                              defaultActiveKey={["1"]}
                              _onChange={onChangeCollapseHandle}
                            />
                          </div>
                        );
                      })
                    : filteredData.map((sectionTitle) => {
                        return (
                          <div
                            style={{ margin: "12px 0px 0px 0px" }}
                            key={sectionTitle}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: "6px",
                              }}
                            >
                              <span style={sectionTitleStyle}>
                                {sectionTitle}
                              </span>
                            </div>
                            <Collapse
                              items={
                                onlyIconMode
                                  ? filteredDataOnlyIcon[sectionTitle] || []
                                  : filteredDataIconDescription[
                                      sectionTitle || []
                                    ]
                              }
                              ghost
                              defaultActiveKey={["1"]}
                              _onChange={onChangeCollapseHandle}
                            />
                          </div>
                        );
                      })}
                </div>
              </div>
            </div>
          ) : (
            <div></div>
          )}
        </div>
      </div>
    </>
  );
};

export default DesignerWrapper;
