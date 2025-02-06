import { useRef } from "react";
import Icon from "react-cismap/commons/Icon";
import type { Doc } from "../document-viewer";
import { useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFile } from "@fortawesome/free-regular-svg-icons";
import { ProgressBar } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";

interface SidebarProps {
  docs: Doc[];
  index: number;
  maxIndex: number;
  mode: string;
  compactView: boolean;
}

const Sidebar = ({
  docs,
  index,
  maxIndex,
  mode,
  compactView,
}: SidebarProps) => {
  const { docPackageId, page } = useParams();
  const navigate = useNavigate();
  const sidebarRef = useRef(null);

  const INDENTATION_PER_LEVEL = 15; // pixels per level
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
    return structure.split('/').filter(Boolean);
  };

  const getChangedStructureLevels = (currentDoc: Doc, index: number, docs: Doc[]) => {
    if (!currentDoc.structure) return [];
    if (index === 0) return getStructureParts(currentDoc.structure).map((part, i) => ({ part, level: i }));
    
    const prevDoc = docs[index - 1];
    if (!prevDoc.structure) return getStructureParts(currentDoc.structure).map((part, i) => ({ part, level: i }));

    const currentParts = getStructureParts(currentDoc.structure);
    const prevParts = getStructureParts(prevDoc.structure);
    
    const changedLevels: { part: string, level: number }[] = [];
    
    for (let i = 0; i < currentParts.length; i++) {
      if (i >= prevParts.length || currentParts[i] !== prevParts[i]) {
        changedLevels.push({ part: currentParts[i], level: i });
      }
    }
    
    return changedLevels;
  };

  return (
    <div ref={sidebarRef}>
      <div style={{ marginBottom: 8 }}>
        {docs?.length > 0 &&
          docs?.map((doc, i) => (
            <div key={`sidebarItem.${i}`}>
              {getChangedStructureLevels(doc, i, docs).map(({ part, level }) => (
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
                  }}
                >
                  {part}
                </div>
              ))}
              <div
                style={{
                  background: `${
                    index - 1 === i ? "rgb(119, 119, 119)" : "#f5f5f5"
                  }`,
                  height: "100%",
                  padding: BASE_PADDING,
                  marginBottom: "8px",
                  cursor: "pointer",
                  color: "#333",
                  marginLeft: doc.structure
                    ? (getIndentationLevel(doc.structure) + 1) * INDENTATION_PER_LEVEL
                    : 0,
                }}
                onClick={() => navigate(`/docs/${docPackageId}/${i + 1}/1`)}
              >
                <div
                  style={{
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    display: "flex",
                    gap: "6px",
                  }}
                >
                  {doc.group === "Zusatzdokumente" ? (
                    <FontAwesomeIcon
                      icon={faFile}
                      size={compactView ? "3x" : "1x"}
                    />
                  ) : (
                    <Icon name="file-pdf-o" size={compactView ? "3x" : "1x"} />
                  )}

                  <p
                    style={{
                      marginTop: 2,
                      marginBottom: 5,
                      fontSize: 11,
                      wordWrap: "break-word",
                      textWrap: "pretty",
                      overflowWrap: "break-word",
                      textAlign: "center",
                    }}
                  >
                    <span>{doc.title || filenameShortener(doc.file)}</span>
                  </p>
                  {index - 1 === i && (
                    <>
                      <ProgressBar
                        style={{
                          height: "5px",
                          width: "100%",
                          marginTop: 0,
                          marginBottom: 0,
                        }}
                        max={maxIndex}
                        min={0}
                        now={parseInt(page!)}
                      />
                      <p style={{ marginBottom: 0 }}>
                        {page} / {maxIndex}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

export default Sidebar;
