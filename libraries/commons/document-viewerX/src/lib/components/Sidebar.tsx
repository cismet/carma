import { useRef, useEffect, useState } from "react";
import Icon from "react-cismap/commons/Icon";
import type { Doc } from "../document-viewer";
import { useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFile } from "@fortawesome/free-regular-svg-icons";
import { faFolder, faChevronRight, faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { ProgressBar } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import styled from "styled-components";

export const SIDEBAR_BACKGROUND_COLOR = "#ffffff";

interface SidebarProps {
  docs: Doc[];
  index: number;
  maxIndex: number;
  mode: string;
  compactView: boolean;
  collapsible?: boolean;
  initialCollapsed?: boolean;
  dynamicPrefixDetection?: boolean;
  improveReadabilityOfDocTitles?: boolean;
}

interface HoverDivProps {
  isSelected: boolean;
}

export default function Sidebar({
  docs,
  index,
  maxIndex,
  mode,
  compactView,
  collapsible = true,
  initialCollapsed = true,
  dynamicPrefixDetection = false,
  improveReadabilityOfDocTitles = false,
}: SidebarProps) {
  const { docPackageId, page } = useParams();
  const navigate = useNavigate();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const prevDocs = useRef<Doc[]>(docs);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialCollapsed && !initialized && (docs !== prevDocs.current || !collapsedFolders.size)) {
      const rootFolders = new Set<string>();
      docs.forEach((doc) => {
        if (doc.structure) {
          const parts = getStructureParts(doc.structure);
          if (parts.length > 0) {
            const fullPath = '/' + parts[0];
            rootFolders.add(fullPath);
          }
        }
      });
      setCollapsedFolders(rootFolders);
      setInitialized(true);
    } else if (!initialCollapsed && docs !== prevDocs.current) {
      setCollapsedFolders(new Set());
    }
    prevDocs.current = docs;
  }, [docs, initialCollapsed]);

  useEffect(() => {
    if (selectedItemRef.current && sidebarRef.current) {
      selectedItemRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [index]);

  const INDENTATION_PER_LEVEL = 10; // pixels per level
  const BASE_PADDING = 6; // base padding in pixels
  const BASE_MARGIN = 10;

  const SIDEBAR_FILENAME_SHORTENER = {
    bplaene: (original: string) => {
      const ret = original
        .replace(/.pdf$/, "")
        .replace(/^BPL_n?a?\d*V?-?(A|B|C)*\d*_(0_)*/, "")
        .replace(/Info_BPlan-Zusatzdokumente_WUP.*/, "Info Dateinamen");
      return ret;
    },
    aenderungsv: (original: string) => {
      return original.replace(/.pdf$/, "").replace(/^FNP_n*\d*_\d*(And)*_/, "");
    },
  };

  const filenameShortener = (original: string) => {
    const shorty = SIDEBAR_FILENAME_SHORTENER[mode](original);

    return shorty;
  };

  const getIndentationLevel = (structure: string | undefined) => {
    if (!structure) return 0;
    // For root level ("/") return 0, otherwise count actual levels
    if (structure === "/") return 0;
    return structure.split("/").filter(Boolean).length;
  };

  const getStructureParts = (structure: string) => {
    return structure.split("/").filter(Boolean);
  };

  const findCommonPrefixForStructure = (
    docs: Doc[],
    structure: string
  ): Map<string, Doc[]> => {
    const docsInStructure = docs.filter(
      (doc) => doc.structure === structure && doc.title
    );
    const prefixGroups = new Map<string, Doc[]>();

    // If there's only one document, check if it has a date-ending prefix
    if (docsInStructure.length === 1) {
      const doc = docsInStructure[0];
      const title = doc.title || "";
      // Match either YYYY-MM_ or MM-YYYY_ pattern with any prefix
      const prefixMatch = title.match(/^.*?(\d{4}-\d{2}|\d{2}-\d{4})_/);
      if (prefixMatch) {
        prefixGroups.set(prefixMatch[0], [doc]);
      }
      return prefixGroups;
    }

    // Find potential prefixes from titles that end with underscore
    const potentialPrefixes = new Set<string>();
    docsInStructure.forEach((doc) => {
      const title = doc.title || "";
      const prefixMatch = title.match(/^.*?(\d{4}-\d{2}|\d{2}-\d{4})_/);
      if (prefixMatch) {
        potentialPrefixes.add(prefixMatch[0]);
      }
    });

    // Group documents by prefix, including exact matches
    potentialPrefixes.forEach((prefix) => {
      const docsWithPrefix: Doc[] = [];
      const exactMatches: Doc[] = [];

      docsInStructure.forEach((doc) => {
        const title = doc.title || "";
        // Check for exact match (without the underscore)
        if (title === prefix.slice(0, -1)) {
          exactMatches.push(doc);
        }
        // Check for prefix match
        else if (title.startsWith(prefix)) {
          docsWithPrefix.push(doc);
        }
      });

      // If we found matches and/or exact matches
      if (docsWithPrefix.length > 0 || exactMatches.length > 0) {
        // Put exact matches first, then the rest
        prefixGroups.set(prefix, [...exactMatches, ...docsWithPrefix]);
      }
    });

    return prefixGroups;
  };

  const structurePrefixGroups = new Map<string, Map<string, Doc[]>>();

  const getPrefixGroups = (docs: Doc[], doc: Doc) => {
    if (!doc.structure) return new Map<string, Doc[]>();

    const cached = structurePrefixGroups.get(doc.structure);
    if (cached) return cached;

    const groups = findCommonPrefixForStructure(docs, doc.structure);
    structurePrefixGroups.set(doc.structure, groups);
    return groups;
  };

  const getDocumentPrefix = (
    doc: Doc,
    prefixGroups: Map<string, Doc[]>
  ): string | null => {
    if (!doc.title) return null;
    for (const [prefix, docs] of prefixGroups.entries()) {
      if (docs.some((d) => d === doc)) return prefix;
    }
    return null;
  };

  const formatPrefixForDisplay = (prefix: string): string => {
    // Handle both YYYY-MM and MM-YYYY patterns
    const match = prefix.match(/^(.*?)(\d{4}-\d{2}|\d{2}-\d{4})_$/);
    if (match) {
      const [_, prefixPart, datePart] = match;
      // Convert the date part to a consistent format (YYYY/MM)
      const formattedDate = datePart.match(/^\d{4}/)
        ? datePart.replace(/^(\d{4})-(\d{2})$/, "$1/$2") // YYYY-MM to YYYY/MM
        : datePart.replace(/^(\d{2})-(\d{4})$/, "$2/$1"); // MM-YYYY to YYYY/MM
      return (prefixPart + formattedDate).trim();
    }
    return prefix.endsWith("_") ? prefix.slice(0, -1) : prefix;
  };

  const shouldShowPrefixHeader = (
    currentDoc: Doc,
    index: number,
    docs: Doc[]
  ) => {
    if (!dynamicPrefixDetection) return false;
    if (!currentDoc.structure) return false;

    // For first document, show prefix if it has one
    if (index === 0) {
      const currentPrefix = getDocumentPrefix(
        currentDoc,
        getPrefixGroups(docs, currentDoc)
      );
      return currentPrefix !== null;
    }

    const prevDoc = docs[index - 1];
    const currentPrefix = getDocumentPrefix(
      currentDoc,
      getPrefixGroups(docs, currentDoc)
    );
    const prevPrefix = getDocumentPrefix(
      prevDoc,
      getPrefixGroups(docs, prevDoc)
    );
    return (
      prevDoc.structure !== currentDoc.structure || currentPrefix !== prevPrefix
    );
  };

  const getChangedStructureLevels = (
    currentDoc: Doc,
    index: number,
    docs: Doc[]
  ) => {
    if (!currentDoc.structure) return [];
    if (index === 0)
      return getStructureParts(currentDoc.structure).map((part, i) => ({
        part,
        level: i,
      }));

    const prevDoc = docs[index - 1];
    if (!prevDoc.structure)
      return getStructureParts(currentDoc.structure).map((part, i) => ({
        part,
        level: i,
      }));

    const currentParts = getStructureParts(currentDoc.structure);
    const prevParts = getStructureParts(prevDoc.structure);

    // Compare each level and only show if it's different from the previous document
    const changedLevels: { part: string; level: number }[] = [];
    for (let i = 0; i < currentParts.length; i++) {
      const prevPath = prevParts.slice(0, i + 1).join('/');
      const currentPath = currentParts.slice(0, i + 1).join('/');
      
      if (prevPath !== currentPath) {
        // If this level changed, we need to show it
        changedLevels.push({ part: currentParts[i], level: i });
      }
    }

    return changedLevels;
  };

  const getDocsInStructure = (docs: Doc[], structure: string) => {
    return docs.filter((doc) => doc.structure === structure);
  };

  const improveReadability = (title: string): string => {
    if (!improveReadabilityOfDocTitles) return title;

    // Replace German umlaut representations
    let improved = title
      .replace(/AE/g, "Ä")
      .replace(/ae/g, "ä")
      .replace(/OE/g, "Ö")
      .replace(/oe/g, "ö")
      .replace(/UE/g, "Ü")
      .replace(/ue/g, "ü");

    // Add spaces before capital letters (camelCase to spaces)
    improved = improved.replace(/([a-z])([A-Z])/g, "$1 $2");

    // Add space between word and number
    improved = improved.replace(/([a-zA-Z])(\d)/g, "$1 $2");

    // Replace hyphens and underscores with spaces
    improved = improved.replace(/[-_]/g, " ");

    // Clean up any double spaces that might have been created
    improved = improved.replace(/\s+/g, " ").trim();

    return improved;
  };

  const removePrefix = (title: string, prefix: string | null) => {
    if (!prefix || !title) return improveReadability(title);
    // If the title exactly matches the prefix (without underscore), return it as is
    if (title === prefix.slice(0, -1)) return improveReadability(title);
    // Otherwise remove the prefix
    return improveReadability(
      title.startsWith(prefix) ? title.slice(prefix.length).trim() : title
    );
  };

  const toggleFolder = (path: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const isDocVisible = (doc: Doc) => {
    if (!doc.structure) return true;
    const parts = getStructureParts(doc.structure);
    
    // Build and check each level of the path
    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      currentPath = currentPath + '/' + parts[i];
      if (collapsedFolders.has(currentPath)) {
        return false;
      }
    }
    return true;
  };

  const shouldShowStructureLevel = (currentDoc: Doc, level: number) => {
    if (!currentDoc.structure) return true;
    const parts = getStructureParts(currentDoc.structure);
    
    // Check all parent folders up to this level
    let currentPath = '';
    for (let i = 0; i < level; i++) {
      currentPath = currentPath + '/' + parts[i];
      if (collapsedFolders.has(currentPath)) {
        return false;
      }
    }
    return true;
  };

  const VerticalLines = ({
    level,
    isDocument,
  }: {
    level: number;
    isDocument?: boolean;
  }) => (
    <>
      {Array.from({ length: level }).map((_, index) => (
        <div
          key={`line-${index}`}
          style={{
            position: "absolute",
            left: `${
              2 -
              (level - index - 1) * INDENTATION_PER_LEVEL -
              (isDocument ? 10 : 0)
            }px`,
            top: "-12px",
            width: "1px",
            height: "calc(100% + 14px)",
            backgroundColor: "#ddd",
          }}
        />
      ))}
    </>
  );

  const HoverDiv = styled.div<HoverDivProps>`
    background: ${(props) =>
      props.isSelected ? "rgba(58, 124, 235, 0.1)" : "#ffffff"};
    height: 100%;
    padding: ${BASE_PADDING + 0}px;
    margin-bottom: 8px;

    cursor: pointer;
    color: #333;
    position: relative;
    border-radius: ${(props) => (props.isSelected ? "6px" : "0")};
    transition: background-color 0.2s ease;

    &:hover {
      background-color: ${(props) =>
        props.isSelected ? "rgba(58, 124, 235, 0.1)" : "#f8f8f8"};
    }
  `;

  return (
    <div ref={sidebarRef} style={{ backgroundColor: SIDEBAR_BACKGROUND_COLOR }}>
      <div style={{ marginBottom: 8 }}>
        {docs?.length > 0 &&
          docs?.map((doc, i) => {
            const prefixGroups = getPrefixGroups(docs, doc);
            const documentPrefix = getDocumentPrefix(doc, prefixGroups);
            const showDocument = isDocVisible(doc);

            return (
              <div key={`sidebarItem.${i}`}>
                {getChangedStructureLevels(doc, i, docs).map(
                  ({ part, level }) => {
                    const fullPath = "/" + getStructureParts(doc.structure || "").slice(0, level + 1).join("/");
                    const isCollapsed = collapsedFolders.has(fullPath);

                    // Only show structure levels that should be visible
                    if (!shouldShowStructureLevel(doc, level)) return null;

                    return (
                      <div
                        key={`structure-${i}-${level}`}
                        style={{
                          padding: "4px 8px",
                          backgroundColor: compactView ? "#e8e8e8" : "#ffffff",
                          opacity: 1,
                          zIndex: 999999,
                          fontSize: "12px",
                          fontWeight: "bold",
                          color: "#666",
                          marginBottom: "8px",
                          marginLeft: level * INDENTATION_PER_LEVEL,
                          cursor: collapsible ? "pointer" : "default",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          position: "relative",
                          borderRadius: compactView ? "4px" : "0",
                        }}
                        onClick={() => {
                          if (collapsible) {
                            toggleFolder(fullPath);
                          }
                        }}
                      >
                        <VerticalLines level={level} isDocument={false} />
                        {!compactView && (
                          <>
                            {collapsible && (
                              <FontAwesomeIcon
                                icon={isCollapsed ? faChevronRight : faChevronDown}
                                style={{
                                  fontSize: "12px",
                                  color: "#666",
                                  width: "12px",
                                }}
                              />
                            )}
                            <FontAwesomeIcon
                              icon={faFolder}
                              style={{
                                fontSize: "16px",
                                color: "#666",
                              }}
                            />
                          </>
                        )}
                        {part}
                      </div>
                    );
                  }
                )}
                {showDocument && shouldShowPrefixHeader(doc, i, docs) && documentPrefix && (
                  <div
                    style={{
                      padding: "4px 8px",
                      backgroundColor: "#ffffff",
                      fontSize: "12px",
                      fontWeight: "bold",
                      color: "#666",
                      marginBottom: "8px",
                      marginLeft: doc.structure
                        ? getIndentationLevel(doc.structure) * INDENTATION_PER_LEVEL
                        : 0,
                      position: "relative",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      const docsWithPrefix = Array.from(
                        prefixGroups.get(documentPrefix) || []
                      );
                      console.log("Documents with prefix:", documentPrefix);
                      console.log(
                        "Documents:",
                        JSON.stringify(
                          docsWithPrefix.map((d) => ({
                            title: d.title,
                            file: d.file,
                            structure: d.structure,
                          })),
                          null,
                          2
                        )
                      );
                    }}
                  >
                    <VerticalLines
                      level={
                        doc.structure ? getIndentationLevel(doc.structure) : 0
                      }
                      isDocument={false}
                    />
                    {formatPrefixForDisplay(documentPrefix)} ...
                  </div>
                )}
                {showDocument && (
                  <HoverDiv
                    ref={index - 1 === i ? selectedItemRef : null}
                    isSelected={index - 1 === i}
                    style={{
                      marginLeft:
                        (doc.structure
                          ? getIndentationLevel(doc.structure) * INDENTATION_PER_LEVEL
                          : 0) +
                        (getIndentationLevel(doc.structure) > 0
                          ? BASE_MARGIN
                          : 0),
                      position: "relative",
                    }}
                    onClick={() => navigate(`/docs/${docPackageId}/${i + 1}/1`)}
                  >
                    <VerticalLines
                      level={
                        doc.structure ? getIndentationLevel(doc.structure) : 0
                      }
                      isDocument={true}
                    />
                    <div
                      style={{
                        flexDirection: compactView ? "column" : "row",
                        justifyContent: compactView ? "center" : "flex-start",
                        alignItems: "center",
                        display: "flex",
                        gap: "6px",
                        width: "100%",
                        paddingLeft: doc.structure ? "4px" : "0",
                      }}
                    >
                      {doc.primary === true ? (
                        <Icon
                          name="file-pdf-o"
                          style={{
                            fontSize: compactView ? "36" : "20px",
                            color: "#666",
                          }}
                        />
                      ) : (
                        <FontAwesomeIcon
                          icon={faFile}
                          style={{
                            fontSize: compactView ? "36px" : "20px",
                            color: "#666",
                          }}
                        />
                      )}

                      <div
                        style={{
                          display: "flex",
                          flex: 1,
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <p
                          style={{
                            marginTop: compactView ? 2 : 0,
                            marginBottom: compactView ? 8 : 0,
                            fontSize: 11,
                            wordWrap: "break-word",
                            textWrap: "pretty",
                            overflowWrap: "break-word",
                            textAlign: compactView ? "center" : "left",
                          }}
                        >
                          <span>
                            {doc.title
                              ? dynamicPrefixDetection
                                ? removePrefix(doc.title, documentPrefix)
                                : improveReadabilityOfDocTitles
                                ? improveReadability(doc.title)
                                : doc.title
                              : filenameShortener(doc.file)}
                          </span>
                        </p>
                        {index - 1 === i && !compactView && (
                          <span
                            style={{
                              fontSize: 11,
                              whiteSpace: "nowrap",
                              color: "#222",
                            }}
                          >
                            {page} / {maxIndex}
                          </span>
                        )}
                      </div>
                    </div>
                    {index - 1 === i && (
                      <>
                        {!compactView ? (
                          <div
                            style={{
                              position: "absolute",
                              bottom: 0,
                              left: 0,
                              right: 0,
                            }}
                          >
                            <ProgressBar
                              style={{
                                height: "1px",
                                width: "100%",
                                margin: 0,
                                borderRadius: 0,
                              }}
                              max={maxIndex}
                              min={0}
                              now={parseInt(page!)}
                            />
                          </div>
                        ) : (
                          <div style={{ width: "100%" }}>
                            <ProgressBar
                              style={{
                                height: "3px",
                                width: "100%",
                                marginTop: 0,
                                marginBottom: 0,
                              }}
                              max={maxIndex}
                              min={0}
                              now={parseInt(page!)}
                            />
                            <p
                              style={{
                                marginBottom: 0,
                                textAlign: "center",
                                fontSize: 11,
                                color: "#222",
                              }}
                            >
                              {page} / {maxIndex}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </HoverDiv>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
