import { useRef, useEffect } from "react";
import Icon from "react-cismap/commons/Icon";
import type { Doc } from "../document-viewer";
import { useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFile } from "@fortawesome/free-regular-svg-icons";
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
  dynamicPrefixDetection?: boolean;
  improveReadabilityOfDocTitles?: boolean;
}

const Sidebar = ({
  docs,
  index,
  maxIndex,
  mode,
  compactView,
  dynamicPrefixDetection = false,
  improveReadabilityOfDocTitles = false,
}: SidebarProps) => {
  const { docPackageId, page } = useParams();
  const navigate = useNavigate();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedItemRef.current && sidebarRef.current) {
      selectedItemRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [index]);

  const INDENTATION_PER_LEVEL = 5; // pixels per level
  const BASE_PADDING = 6; // base padding in pixels

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
    return (structure.match(/\//g) || []).length - 1;
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

    // If there's only one document, check if it has a date prefix
    if (docsInStructure.length === 1) {
      const doc = docsInStructure[0];
      const title = doc.title || "";
      const dateMatch = title.match(/^\d{4}-\d{2}_/);
      if (dateMatch) {
        prefixGroups.set(dateMatch[0], [doc]);
      }
      return prefixGroups;
    }

    // Group documents by their date prefix
    docsInStructure.forEach((doc) => {
      const title = doc.title || "";
      const dateMatch = title.match(/^\d{4}-\d{2}_/);
      if (dateMatch) {
        const prefix = dateMatch[0];
        const docs = prefixGroups.get(prefix) || [];
        docs.push(doc);
        prefixGroups.set(prefix, docs);
      }
    });

    return prefixGroups;
  };

  const structurePrefixGroups = new Map<string, Map<string, Doc[]>>();

  const getPrefixGroups = (docs: Doc[], doc: Doc) => {
    if (!doc.structure) return new Map<string, Doc[]>();

    if (!structurePrefixGroups.has(doc.structure)) {
      const groups = findCommonPrefixForStructure(docs, doc.structure);
      structurePrefixGroups.set(doc.structure, groups);
    }

    return structurePrefixGroups.get(doc.structure) || new Map<string, Doc[]>();
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
    if (prefix.match(/^\d{4}-\d{2}_/)) {
      // Convert YYYY-MM_ to YYYY/MM
      return prefix.replace(/^(\d{4})-(\d{2})_$/, "$1/$2");
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

    const changedLevels: { part: string; level: number }[] = [];

    for (let i = 0; i < currentParts.length; i++) {
      if (i >= prevParts.length || currentParts[i] !== prevParts[i]) {
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
    return improveReadability(
      title.startsWith(prefix) ? title.slice(prefix.length).trim() : title
    );
  };

  const HoverDiv = styled.div`
    background: ${props => props.isSelected ? "rgba(58, 124, 235, 0.1)" : "#ffffff"};
    height: 100%;
    padding: ${BASE_PADDING}px;
    margin-bottom: 8px;
    cursor: pointer;
    color: #333;
    position: relative;
    border-radius: ${props => props.isSelected ? "6px" : "0"};
    transition: background-color 0.2s ease;

    &:hover {
      background-color: ${props => props.isSelected ? "rgba(58, 124, 235, 0.1)" : "#f8f8f8"};
    }
  `;

  return (
    <div ref={sidebarRef} style={{ backgroundColor: SIDEBAR_BACKGROUND_COLOR }}>
      <div style={{ marginBottom: 8 }}>
        {docs?.length > 0 &&
          docs?.map((doc, i) => {
            const prefixGroups = getPrefixGroups(docs, doc);
            const documentPrefix = getDocumentPrefix(doc, prefixGroups);

            return (
              <div key={`sidebarItem.${i}`}>
                {getChangedStructureLevels(doc, i, docs).map(
                  ({ part, level }) => (
                    <div
                      key={`structure-${i}-${level}`}
                      style={{
                        padding: "4px 8px",
                        backgroundColor: "#f0f0f0",
                        fontSize: "12px",
                        fontWeight: "bold",
                        color: "#666",
                        marginBottom: "8px",
                        marginLeft: level * INDENTATION_PER_LEVEL,
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        const docsInStructure = getDocsInStructure(
                          docs,
                          doc.structure || ""
                        );
                        console.log("Documents in structure:", doc.structure);
                        console.log(
                          "Documents:",
                          JSON.stringify(
                            docsInStructure.map((d) => ({
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
                      {part}
                    </div>
                  )
                )}
                {shouldShowPrefixHeader(doc, i, docs) && documentPrefix && (
                  <div
                    style={{
                      paddingBottom: "4px",
                      fontSize: "11px",
                      color: "#444",
                      marginLeft:
                        (doc.structure
                          ? getIndentationLevel(doc.structure) + 1
                          : 0) * INDENTATION_PER_LEVEL,
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
                    {formatPrefixForDisplay(documentPrefix)} ...
                  </div>
                )}
                <HoverDiv
                  ref={index - 1 === i ? selectedItemRef : null}
                  isSelected={index - 1 === i}
                  style={{
                    marginLeft: doc.structure
                      ? (getIndentationLevel(doc.structure) + 1) *
                        INDENTATION_PER_LEVEL
                      : 0,
                  }}
                  onClick={() => navigate(`/docs/${docPackageId}/${i + 1}/1`)}
                >
                  <div
                    style={{
                      flexDirection: compactView ? "column" : "row",
                      justifyContent: compactView ? "center" : "flex-start",
                      alignItems: "center",
                      display: "flex",
                      gap: "6px",
                      width: "100%",
                    }}
                  >
                    {doc.group === "Zusatzdokumente" ? (
                      <FontAwesomeIcon
                        icon={faFile}
                        size={compactView ? "3x" : "1x"}
                      />
                    ) : (
                      <Icon
                        name="file-pdf-o"
                        size={compactView ? "3x" : "1x"}
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
                          marginBottom: compactView ? 5 : 0,
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
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default Sidebar;
