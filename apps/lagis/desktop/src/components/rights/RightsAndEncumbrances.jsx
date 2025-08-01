import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import TableCustom from "../ui/tables/TableCustom";
import { useEffect, useState } from "react";
import RightsForm from "./form/RightsForm";
import ToggleModal from "../ui/control-board/ToggleModal";
import { nanoid } from "@reduxjs/toolkit";
import { compare } from "../../core/tools/helper";
import { Switch } from "antd";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import localeData from "dayjs/plugin/localeData";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { rebe } from "@carma-collab/wuppertal/lagis-desktop";
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(customParseFormat);
const columns = [
  {
    title: rebe.rebeTable.farbeCol,
    dataIndex: "farbe",
    render: (title, record, rowIndex) => (
      <div className="flex items-center">
        <span
          style={{
            width: "9px",
            height: "11px",
            marginRight: "6px",
            backgroundColor: record?.color || "transporent",
          }}
        ></span>
        <span>{title}</span>
      </div>
    ),
    sorter: (a, b) => compare(a.recht, b.recht),
  },
  {
    title: rebe.rebeTable.rechtCol,
    dataIndex: "recht",
    render: (record) => <Switch size="small" checked={record} />,
    sorter: (a, b) => compare(a.recht, b.recht),
  },
  {
    title: rebe.rebeTable.artCol,
    dataIndex: "art",
    sorter: (a, b) => compare(a.art, b.art),
  },
  {
    title: rebe.rebeTable.artrechtCol,
    dataIndex: "artrecht",
    sorter: (a, b) => compare(a.artrecht, b.artrecht),
  },
  {
    title: rebe.rebeTable.nummerCol,
    dataIndex: "nummer",
    sorter: (a, b) => compare(a.nummer, b.nummer),
  },
  {
    title: rebe.rebeTable.eintragungCol,
    dataIndex: "eintragung",
    sorter: (a, b) => compare(a.eintragung, b.eintragung),
  },
  {
    title: rebe.rebeTable.loschungCol,
    dataIndex: "loschung",
    sorter: (a, b) => compare(a.loschung, b.loschung),
  },
  {
    title: rebe.rebeTable.bemerkungCol,
    dataIndex: "bemerkung",
    sorter: (a, b) => compare(a.bemerkung, b.bemerkung),
  },
];
const mockExtractor = (input) => {
  return [
    {
      id: "1",
      recht: "",
      art: "Dienstbarkeit",
      artrecht: "Geh- und Fahrrecht",
      nummer: "Dept. II, No. 22",
      eintragung: "07.05.2001",
      loschung: "21.07.2016",
      bemerkung: "21.07.2016",
    },
    {
      id: "2",
      recht: "",
      art: "Dienstbarkeit",
      artrecht: "Geh- und Fahrrecht",
      nummer: "Dept. II, No. 23",
      eintragung: "07.05.2001",
      loschung: "21.07.2016",
      bemerkung: "1111111",
    },
    {
      id: "3",
      recht: "",
      art: "Dienstbarkeit",
      artrecht: "Geh- und Fahrrecht",
      nummer: "Dept. II, No. 24",
      eintragung: "07.5.2001",
      loschung: "21.07.2016",
      bemerkung: "22222",
    },
    {
      id: "4",
      recht: "",
      art: "Dienstbarkeit",
      artrecht: "Geh- und Fahrrecht",
      nummer: "Dept. II, No. 25",
      eintragung: "07.05.2001",
      loschung: "12.06.2002",
      bemerkung: "3333333",
    },
  ];
};

const RightsAndEncumbrances = ({
  dataIn,
  extractor = mockExtractor,
  width = 231,
  height = 188,
  style,
  setExtraGeom,
  selectedTableRowId,
  setSelectedTableRowId,
  selectedTableIdByMap,
}) => {
  // const data = extractor(dataIn);
  const isStory = false;
  const storyStyle = { width, height, ...style };
  // const dateFormat = "DD.MM.YYYY";
  const [rights, setRghts] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const addRow = () => {
    const newRow = {
      id: nanoid(),
      recht: "",
      art: "",
      artrecht: "",
      nummer: "",
      eintragung: "",
      loschung: "",
      bemerkung: "",
    };
    setRghts((prev) => [...prev, newRow]);
    setActiveRow(newRow);
  };
  const deleteRow = () => {
    const updatedArray = rights.filter((row) => row.id !== activeRow?.id);
    setRghts(updatedArray);
    if (activeRow?.id === rights[0]?.id) {
      setActiveRow(rights[1]);
    } else {
      setActiveRow(rights[0]);
    }
  };
  useEffect(() => {
    const data = extractor(dataIn);
    setRghts(data);
    setActiveRow(data[0]);
    setSelectedTableRowId(data[0]?.id);
  }, [dataIn]);
  useEffect(() => {
    if (
      activeRow &&
      setSelectedTableRowId !== null &&
      activeRow !== setSelectedTableRowId
    ) {
      setExtraGeom(rights);
      setSelectedTableRowId(activeRow.id);
    }
  }, [activeRow]);
  useEffect(() => {
    if (selectedTableIdByMap !== null && activeRow) {
      if (selectedTableIdByMap !== activeRow.id) {
        setActiveRow(rights[selectedTableIdByMap]);
      }
    }
  }, [selectedTableIdByMap]);
  return (
    <div
      style={isStory ? storyStyle : { height: "100%" }}
      className="shadow-md w-full"
    >
      <InfoBlock
        title={rebe.rebeTable.tableTitle}
        controlBar={
          <ToggleModal
            section="Rechte und Belastungen"
            modalWidth={500}
            addRow={addRow}
            deleteActiveRow={deleteRow}
          >
            <RightsForm fields={activeRow} />
          </ToggleModal>
        }
      >
        <div className="overflow-auto">
          <TableCustom
            columns={columns}
            data={rights}
            activeRow={activeRow}
            setActiveRow={setActiveRow}
            selectedFeatureKey={"selectedTableGeom"}
          />
        </div>
      </InfoBlock>
    </div>
  );
};

export default RightsAndEncumbrances;
RightsAndEncumbrances.propTypes = {
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
