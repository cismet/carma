import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import TableCustom from "../ui/tables/TableCustom";
import mockFoto from "../../assets/docksMock.png";
import { useEffect, useMemo, useState } from "react";
import { Input, message } from "antd";
import {
  FileWordOutlined,
  FileOutlined,
  FileMarkdownOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  FileExcelOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import { dms as dmsHelper } from "@carma-collab/wuppertal/lagis-desktop";
import EditableTable from "../editing/EditableTable";
import useDraftTable from "../editing/useDraftTable";
import useInvalidCells from "../editing/useInvalidCells";
import { byText, requiredTitle, withSort } from "../editing/columns";
import useEditSection from "../editing/useEditSection";
import {
  d3IdFromLink,
  d3LinkOf,
  d3RowFromLink,
  dmsRowFromLink,
  isDmsLink,
  linkFromDrop,
  newD3Row,
  newDmsRow,
  previewOf,
} from "../../core/editing/dms";
import { D3_RULES, DMS_RULES } from "../../core/editing/validation";
import { DMS_ADD_FILE_LINKS } from "../../constants/lagis";

const D3Icon = ({ style, className }) => (
  <span
    style={{ ...style, lineHeight: 1, fontWeight: 700, letterSpacing: "-1px" }}
    className={className}
  >
    D3
  </span>
);

const ICONS = {
  d3: D3Icon,
  TIF: FileImageOutlined,
  tif: FileImageOutlined,
  JPG: FileImageOutlined,
  txt: FileTextOutlined,
  TXT: FileTextOutlined,
  doc: FileWordOutlined,
  docx: FileWordOutlined,
  PDF: FilePdfOutlined,
  pdf: FilePdfOutlined,
  xlsx: FileExcelOutlined,
  xls: FileExcelOutlined,
  msg: FileMarkdownOutlined,
  "": FileOutlined,
};

const Preview = ({ href, fileType }) => {
  const Icon = ICONS[fileType];
  return (
    <div className="flex items-center justify-center">
      {Icon && href ? (
        <a href={href} target={fileType === "d3" ? "_d3" : "_blank"}>
          <Icon
            style={{ fontSize: "20px" }}
            className="cursor-pointer text-blue-500 hover:text-blue-400"
          />
        </a>
      ) : null}
    </div>
  );
};

const columns = [
  {
    title: dmsHelper.dmsTable.nameCol,
    dataIndex: "name",
    key: "name",
    sorter: byText((row) => row.name),
  },
  {
    title: dmsHelper.dmsTable.fileCol,
    dataIndex: "file",
    key: "file",
    sorter: byText((row) => row.file),
  },
  {
    title: dmsHelper.dmsTable.beschreibungCol,
    dataIndex: "beschreibung",
    key: "beschreibung",
    sorter: byText((row) => row.beschreibung),
  },
  {
    title: dmsHelper.dmsTable.vorschauCol,
    dataIndex: "vorschau",
    key: "vorschau",
    render: (href, row) => <Preview href={href} fileType={row.fileType} />,
  },
];

const textInput = (field, update, invalid, placeholder) => (value, record) =>
  (
    <Input
      size="small"
      placeholder={placeholder}
      status={invalid(record, field) ? "error" : undefined}
      value={value}
      onChange={(event) => update(record.id, { [field]: event.target.value })}
    />
  );

// saved rows are read only, like in Java; a new row's cell is an input
const newRowInput = (field, update, invalid, placeholder) => (value, record) =>
  record.dmsId
    ? value
    : textInput(field, update, invalid, placeholder)(value, record);

const d3Columns = [
  {
    title: "Bezeichnung",
    dataIndex: "name",
    key: "name",
    sorter: byText((row) => row.name),
  },
  {
    title: "D3-ID",
    dataIndex: "file",
    key: "d3Id",
    sorter: byText((row) => row.file),
  },
  {
    title: dmsHelper.dmsTable.vorschauCol,
    dataIndex: "vorschau",
    key: "vorschau",
    width: "15%",
    render: (href) => <Preview href={href} fileType="d3" />,
  },
];

const d3EditColumns = (invalid) => (update) =>
  [
    {
      title: requiredTitle("Bezeichnung"),
      key: "name",
      dataIndex: "name",
      sorter: byText((row) => row.name),
      render: newRowInput("name", update, invalid),
    },
    {
      title: requiredTitle("D3-ID"),
      key: "d3Id",
      dataIndex: "d3Id",
      sorter: byText((row) => (row.dmsId ? row.file : row.d3Id)),
      render: (d3Id, record) =>
        record.dmsId
          ? record.file
          : textInput(
              "d3Id",
              update,
              invalid,
              "z. B. SW21376974"
            )(d3Id, record),
    },
    {
      title: dmsHelper.dmsTable.vorschauCol,
      key: "vorschau",
      width: "15%",
      render: (_, record) => {
        const href = record.dmsId
          ? record.vorschau
          : record.d3Id.trim() && d3LinkOf(record.d3Id);
        return <Preview href={href} fileType="d3" />;
      },
    },
  ];

// new file links only when DMS_ADD_FILE_LINKS is on; files are not uploaded
const fileEditColumns = (invalid) => (update) =>
  [
    {
      title: requiredTitle(dmsHelper.dmsTable.nameCol),
      key: "name",
      dataIndex: "name",
      sorter: byText((row) => row.name),
      render: newRowInput("name", update, invalid),
    },
    {
      title: requiredTitle(dmsHelper.dmsTable.fileCol),
      key: "file",
      dataIndex: "link",
      sorter: byText((row) => (row.dmsId ? row.file : row.link)),
      render: (link, record) =>
        record.dmsId
          ? record.file
          : textInput(
              "link",
              update,
              invalid,
              "https://… oder \\\\server\\…"
            )(link, record),
    },
    {
      title: dmsHelper.dmsTable.beschreibungCol,
      key: "beschreibung",
      dataIndex: "beschreibung",
      sorter: byText((row) => row.beschreibung),
      render: newRowInput("beschreibung", update, invalid),
    },
    {
      title: dmsHelper.dmsTable.vorschauCol,
      key: "vorschau",
      render: (_, record) => {
        const { vorschau, fileType } = record.dmsId
          ? record
          : previewOf(record);
        return <Preview href={vorschau} fileType={fileType} />;
      },
    },
  ];

const DocumentTable = ({
  title,
  field,
  rows,
  columns,
  editColumns,
  newRow,
  rules,
  addable = true,
  selection,
}) => {
  const [activeRow, setActiveRow] = useState();
  const [sort, setSort] = useState({});
  const { editable, actions, tableProps } = useDraftTable({
    section: "dms",
    field,
    newRow,
    addable,
    selection,
  });
  const invalid = useInvalidCells("dms", tableProps.rows, rules);
  // keep the selected row when edit turns on; draft ids are the view ids
  useEffect(() => {
    if (editable && activeRow) {
      tableProps.onActiveChange(String(activeRow.id));
    }
  }, [editable]);
  useEffect(() => {
    setActiveRow(rows[0]);
  }, [rows]);

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-md bg-white shadow-md">
      <InfoBlock title={title} controlBar={actions}>
        <div className="relative">
          {editable ? (
            <EditableTable
              {...tableProps}
              columns={(update) => withSort(editColumns(invalid)(update), sort)}
              onSortChange={setSort}
            />
          ) : (
            <TableCustom
              columns={withSort(columns, sort)}
              onSortChange={setSort}
              data={rows}
              activeRow={activeRow}
              setActiveRow={setActiveRow}
              fixHeight={true}
            />
          )}
        </div>
      </InfoBlock>
    </div>
  );
};

const mockExtractor = (input) => {
  return [
    {
      id: "1",
      name: "1237563255",
      file: "Interdum.avi",
      beschreibung: "Lorem ipsum dolor sit amet",
      vorschau: mockFoto,
    },
    {
      id: "2",
      name: "1237563255",
      file: "Interdum.avi",
      beschreibung: "Lorem ipsum dolor sit amet",
      vorschau: mockFoto,
    },
    {
      id: "3",
      name: "1237563255",
      file: "Interdum.avi",
      beschreibung: "Lorem ipsum dolor sit amet",
      vorschau: mockFoto,
    },
    {
      id: "4",
      name: "1237563255",
      file: "Interdum.avi",
      beschreibung: "Lorem ipsum dolor sit amet",
      vorschau: mockFoto,
    },
  ];
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
          editColumns={d3EditColumns}
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
          columns={columns}
          editColumns={fileEditColumns}
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
