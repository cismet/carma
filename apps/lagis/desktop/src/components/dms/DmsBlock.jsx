import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import ToggleModal from "../ui/control-board/ToggleModal";
import TableCustom from "../ui/tables/TableCustom";
import ModalForm from "../ui/forms/ModalForm";
import mockFoto from "../../assets/docksMock.png";
import { useEffect, useState } from "react";
import { nanoid } from "@reduxjs/toolkit";
import {
  FileWordOutlined,
  FileOutlined,
  FileMarkdownOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  FileExcelOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import { compare } from "../../core/tools/helper";
import { dms as dmsHelper } from "@carma-collab/wuppertal/lagis-desktop";

const columns = [
  {
    title: dmsHelper.dmsTable.nameCol,
    dataIndex: "name",
    id: "name",
    sorter: (a, b) => compare(a.bemerkung, b.bemerkung),
  },
  {
    title: dmsHelper.dmsTable.fileCol,
    dataIndex: "file",
    id: "file",
    sorter: (a, b) => compare(a.bemerkung, b.bemerkung),
  },
  {
    title: dmsHelper.dmsTable.beschreibungCol,
    dataIndex: "beschreibung",
    id: "beschreibung",
    sorter: (a, b) => compare(a.bemerkung, b.bemerkung),
  },
  {
    title: dmsHelper.dmsTable.beschreibungCol,
    dataIndex: "vorschau",
    id: "vorschau",
    render: (record, data) => (
      <div className="flex items-center justify-center">
        {data.fileType === "d3" ? (
          <a href={record} target="_d3">
            <FileTextOutlined
              style={{ fontSize: "20px" }}
              className="cursor-pointer text-blue-500 hover:text-blue-400"
            />
          </a>
        ) : null}
        {data.fileType === "TIF" ||
        data.fileType === "tif" ||
        data.fileType === "JPG" ? (
          <a href={record} target="_blank">
            <FileImageOutlined
              style={{ fontSize: "20px" }}
              className="cursor-pointer text-blue-500 hover:text-blue-400"
            />
          </a>
        ) : null}
        {data.fileType === "txt" || data.fileType === "TXT" ? (
          <a href={record} target="_blank">
            <FileTextOutlined
              style={{ fontSize: "20px" }}
              className="cursor-pointer text-blue-500 hover:text-blue-400"
            />
          </a>
        ) : null}
        {data.fileType === "doc" || data.fileType === "docx" ? (
          <a href={record} target="_blank">
            <FileWordOutlined
              style={{ fontSize: "20px" }}
              className="cursor-pointer text-blue-500 hover:text-blue-400"
            />
          </a>
        ) : null}
        {data.fileType === "PDF" || data.fileType === "pdf" ? (
          <a href={record} target="_blank">
            <FilePdfOutlined
              style={{ fontSize: "20px" }}
              className="cursor-pointer text-blue-500 hover:text-blue-400"
            />
          </a>
        ) : null}
        {data.fileType === "xlsx" || data.fileType === "xls" ? (
          <a href={record} target="_blank">
            <FileExcelOutlined
              style={{ fontSize: "20px" }}
              className="cursor-pointer text-blue-500 hover:text-blue-400"
            />
          </a>
        ) : null}
        {data.fileType === "msg" ? (
          <a href={record} target="_blank">
            <FileMarkdownOutlined
              style={{ fontSize: "20px" }}
              className="cursor-pointer text-blue-500 hover:text-blue-400"
            />
          </a>
        ) : null}
        {data.fileType === "" ? (
          <a href={record} target="_blank">
            <FileOutlined
              style={{ fontSize: "20px" }}
              className="cursor-pointer text-blue-500 hover:text-blue-400"
            />
          </a>
        ) : null}
      </div>
    ),
    sorter: (a, b) => compare(a.bemerkung, b.bemerkung),
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
  const addRow = () => {
    const newRow = {
      id: nanoid(),
      name: "",
      file: "",
      beschreibung: "",
      vorschau: "",
    };
    setDms((prev) => [...prev, newRow]);
    setActiveRow(newRow);
  };
  const deleteRow = () => {
    const updatedArray = dms.filter((row) => row.id !== activeRow?.id);
    setDms(updatedArray);
    if (activeRow?.id === dms[0].id) {
      setActiveRow(dms[1]);
    } else {
      setActiveRow(dms[0]);
    }
  };
  useEffect(() => {
    const data = extractor(dataIn);
    if (data.length > 0) {
      setDms(data);
      setActiveRow(data[0]);
    }
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
      <InfoBlock
        title={dmsHelper.dmsTable.tableTitle}
        controlBar={
          <ToggleModal
            section="Kassenzeichen"
            addRow={addRow}
            deleteActiveRow={deleteRow}
          >
            <ModalForm
              formName={activeRow?.id}
              customFields={[
                {
                  title: "Name",
                  value: activeRow?.name,
                  id: nanoid(),
                  name: "name",
                },
                {
                  title: "Dateiname",
                  value: activeRow?.file,
                  id: nanoid(),
                  name: "file",
                },
                {
                  title: "Beschreibung",
                  value: activeRow?.beschreibung,
                  id: nanoid(),
                  name: "beschreibung",
                },
              ]}
              showFileUpload={true}
            />
          </ToggleModal>
        }
      >
        <div className="relative">
          <TableCustom
            columns={columns}
            data={dms}
            activerow={setActiveRow}
            activeRow={activeRow}
            setActiveRow={setActiveRow}
            fixHeight={true}
          />
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
