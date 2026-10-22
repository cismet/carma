import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import { useEffect, useMemo, useState } from "react";
import { message } from "antd";
import { dms as dmsHelper } from "@carma-collab/wuppertal/lagis-desktop";
import SheetTable from "../editing/SheetTable";
import useDraftTable from "../editing/useDraftTable";
import useInvalidCells from "../editing/useInvalidCells";
import useEditSection from "../editing/useEditSection";
import {
  d3IdFromLink,
  d3RowFromLink,
  dmsRowFromLink,
  isDmsLink,
  linkFromDrop,
  newD3Row,
  newDmsRow,
} from "../../core/editing/dms";
import { D3_RULES, DMS_RULES } from "../../core/editing/validation";
import { DMS_ADD_FILE_LINKS } from "../../constants/lagis";
import { d3Columns, fileColumns } from "./dmsColumns";
import { mockExtractor } from "./mockDms";

const DocumentTable = ({
  title,
  field,
  rows,
  columns,
  newRow,
  rules,
  addable = true,
  selection,
}) => {
  const [activeRow, setActiveRow] = useState();
  const { editable, actions, tableProps } = useDraftTable({
    section: "dms",
    field,
    newRow,
    addable,
    selection,
  });
  const invalid = useInvalidCells("dms", tableProps.rows, rules);
  useEffect(() => {
    setActiveRow(rows[0]);
  }, [rows]);

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-md bg-white shadow-md">
      <InfoBlock editable={editable} title={title} controlBar={actions}>
        <div className="relative">
          <SheetTable
            columns={columns({ invalid })}
            editable={editable}
            fixHeight
            view={{ rows, activeRow, setActiveRow }}
            edit={tableProps}
            toEditRow={(row) =>
              tableProps.rows.find((draftRow) => draftRow.id === String(row.id))
            }
          />
        </div>
      </InfoBlock>
    </div>
  );
};

const DmsBlock = ({
  dataIn,
  extractor = mockExtractor,
  width = 231,
  height = 188,
  style,
}) => {
  const isStory = false;
  const storyStyle = { width, height, ...style };
  const [dms, setDms] = useState([]);
  const d3Selection = useState();
  const fileSelection = useState();
  const { editable, draft, patch } = useEditSection("dms");
  const [dropping, setDropping] = useState(false);

  // a D3 link goes to the D3 table wherever it's dropped
  const dropLink = (event) => {
    event.preventDefault();
    setDropping(false);
    const link = linkFromDrop(event.dataTransfer);
    if (d3IdFromLink(link)) {
      const row = d3RowFromLink(link);
      patch({ d3: [...draft.d3, row] });
      d3Selection[1](row.id);
    } else if (DMS_ADD_FILE_LINKS && isDmsLink(link)) {
      const row = dmsRowFromLink(link);
      patch({ dokumente: [...draft.dokumente, row] });
      fileSelection[1](row.id);
    } else if (event.dataTransfer.files.length) {
      message.warning(
        "Dateien können nicht abgelegt werden, nur Links aus dem Browser."
      );
    } else {
      message.warning(
        DMS_ADD_FILE_LINKS
          ? "Das ist kein gültiger Link (https://… oder \\\\server\\…)."
          : "Neue Dokumente können nur als D3-Link angelegt werden."
      );
    }
  };
  const dropZone = {
    onDragOver: (event) => {
      event.preventDefault();
      setDropping(true);
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setDropping(false);
      }
    },
    onDrop: dropLink,
  };
  // A drop that misses the blocks would open the link, i.e. download the file
  useEffect(() => {
    if (!editable) {
      return undefined;
    }
    const block = (event) => {
      if (!event.defaultPrevented) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "none";
      }
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, [editable]);
  useEffect(() => {
    setDms(extractor(dataIn));
  }, [dataIn]);
  const d3Rows = useMemo(() => dms.filter((row) => row.isD3), [dms]);
  const fileRows = useMemo(() => dms.filter((row) => !row.isD3), [dms]);

  return (
    <div
      {...(editable ? dropZone : {})}
      className={`flex flex-col gap-2 rounded-md ${
        dropping ? "outline-dashed outline-2 outline-blue-400" : ""
      }`}
      style={isStory ? storyStyle : { height: "100%" }}
    >
      {/* edit mode keeps it, a D3 document can only be added there */}
      {(editable || d3Rows.length > 0) && (
        <DocumentTable
          title="D3-Dokumente"
          field="d3"
          rows={d3Rows}
          columns={d3Columns}
          newRow={newD3Row}
          rules={D3_RULES}
          selection={d3Selection}
        />
      )}
      {/* without "+" an empty table has nothing to offer, in edit mode too */}
      {(fileRows.length > 0 || (editable && DMS_ADD_FILE_LINKS)) && (
        <DocumentTable
          title={dmsHelper.dmsTable.tableTitle}
          field="dokumente"
          rows={fileRows}
          columns={fileColumns}
          newRow={newDmsRow}
          rules={DMS_RULES}
          addable={DMS_ADD_FILE_LINKS}
          selection={fileSelection}
        />
      )}
      {!editable && dms.length === 0 && (
        <div className="rounded-md bg-white p-4 text-gray-500 shadow-md">
          Keine Dokumente vorhanden
        </div>
      )}
    </div>
  );
};

export default DmsBlock;
DmsBlock.propTypes = {
  /**
   * The current main data object that is being used
   */
  dataIn: PropTypes.array,
  /**
   * The extractor function that is used to transform the dataIn object into the data object
   */
  extractor: PropTypes.func,
  /**
   * The width of the component
   * @default 300
   * @type number
   * @required false
   * @control input
   * @group size
   *
   **/
  width: PropTypes.number,

  /**
   * The height of the component
   *
   * @default 300
   * @type number
   * @required false
   * @control input
   *
   **/

  height: PropTypes.number,
};
