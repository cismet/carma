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
import { byText } from "../editing/columns";
import { d3LinkOf, previewOf } from "../../core/editing/dms";

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

const nameColumn = (title, invalid, width) => ({
  key: "name",
  title,
  width,
  required: true,
  view: { dataIndex: "name", sorter: byText((row) => row.name) },
  edit: (update) => ({
    dataIndex: "name",
    sorter: byText((row) => row.name),
    render: newRowInput("name", update, invalid),
  }),
});

export const d3Columns = ({ invalid }) => [
  nameColumn("Bezeichnung", invalid, "45%"),
  {
    key: "d3Id",
    title: "D3-ID",
    width: "40%",
    required: true,
    view: { dataIndex: "file", sorter: byText((row) => row.file) },
    edit: (update) => ({
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
    }),
  },
  {
    key: "vorschau",
    title: dmsHelper.dmsTable.vorschauCol,
    width: "15%",
    view: {
      dataIndex: "vorschau",
      render: (href) => <Preview href={href} fileType="d3" />,
    },
    edit: () => ({
      render: (_, record) => {
        const href = record.dmsId
          ? record.vorschau
          : record.d3Id.trim() && d3LinkOf(record.d3Id);
        return <Preview href={href} fileType="d3" />;
      },
    }),
  },
];

// new file links only when DMS_ADD_FILE_LINKS is on; files are not uploaded
export const fileColumns = ({ invalid }) => [
  nameColumn(dmsHelper.dmsTable.nameCol, invalid, "25%"),
  {
    key: "file",
    title: dmsHelper.dmsTable.fileCol,
    width: "30%",
    required: true,
    view: { dataIndex: "file", sorter: byText((row) => row.file) },
    edit: (update) => ({
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
    }),
  },
  {
    key: "beschreibung",
    title: dmsHelper.dmsTable.beschreibungCol,
    width: "30%",
    view: {
      dataIndex: "beschreibung",
      sorter: byText((row) => row.beschreibung),
    },
    edit: (update) => ({
      dataIndex: "beschreibung",
      sorter: byText((row) => row.beschreibung),
      render: newRowInput("beschreibung", update, invalid),
    }),
  },
  {
    key: "vorschau",
    title: dmsHelper.dmsTable.vorschauCol,
    width: "15%",
    view: {
      dataIndex: "vorschau",
      render: (href, row) => <Preview href={href} fileType={row.fileType} />,
    },
    edit: () => ({
      render: (_, record) => {
        const { vorschau, fileType } = record.dmsId
          ? record
          : previewOf(record);
        return <Preview href={vorschau} fileType={fileType} />;
      },
    }),
  },
];
