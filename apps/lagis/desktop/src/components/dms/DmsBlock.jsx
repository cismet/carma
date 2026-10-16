import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import TableCustom from "../ui/tables/TableCustom";
import mockFoto from "../../assets/docksMock.png";
import { useEffect, useState } from "react";
import { Input } from "antd";
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
import { newDmsRow, previewOf } from "../../core/editing/dms";
import { DMS_RULES } from "../../core/editing/validation";

const ICONS = {
  d3: FileTextOutlined,
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

// Like Java, saved documents can only be removed; new rows take a link
// (https://… or \\server\…), files are not uploaded.
const editColumns = (invalid) => (update) =>
  [
    {
      title: requiredTitle(dmsHelper.dmsTable.nameCol),
      key: "name",
      dataIndex: "name",
      sorter: byText((row) => row.name),
      render: (name, record) =>
        record.dmsId ? name : textInput("name", update, invalid)(name, record),
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
      render: (beschreibung, record) =>
        record.dmsId
          ? beschreibung
          : textInput("beschreibung", update, invalid)(beschreibung, record),
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
  const [activeRow, setActiveRow] = useState();
  const [sort, setSort] = useState({});
  const { editable, actions, tableProps } = useDraftTable({
    section: "dms",
    field: "dokumente",
    newRow: newDmsRow,
  });
  const invalid = useInvalidCells("dms", tableProps.rows, DMS_RULES);
  // keep the selected row when edit turns on; draft ids are the view ids
  useEffect(() => {
    if (editable && activeRow) {
      tableProps.onActiveChange(String(activeRow.id));
    }
  }, [editable]);
  useEffect(() => {
    const data = extractor(dataIn);
    setDms(data);
    setActiveRow(data[0]);
  }, [dataIn]);

  return (
    <div
      className="shadow-md h-full overflow-auto"
      style={
        isStory
          ? storyStyle
          : { height: "100%", borderRadius: "6px", backgroundColor: "#FFFFFF" }
      }
    >
      <InfoBlock title={dmsHelper.dmsTable.tableTitle} controlBar={actions}>
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
              data={dms}
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
