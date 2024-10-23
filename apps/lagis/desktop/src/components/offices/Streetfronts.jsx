import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import ToggleModal from "../ui/control-board/ToggleModal";
import TableCustom from "../ui/tables/TableCustom";
import ModalForm from "../ui/forms/ModalForm";
import { useEffect, useState } from "react";
import "./offices.css";
import { nanoid } from "@reduxjs/toolkit";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import localeData from "dayjs/plugin/localeData";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { compare } from "../../core/tools/helper";
import { verwaltung } from "@carma-collab/wuppertal/lagis-desktop";

dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(customParseFormat);
const columns = [
  {
    title: verwaltung.strassen.strasseCol,
    dataIndex: "street",
    sorter: (a, b) => compare(a.street, b.street),
  },

  {
    title: verwaltung.strassen.lange,
    dataIndex: "length",
    sorter: (a, b) => compare(a.length, b.length),
  },
];
const mockExtractor = (input) => {
  return [
    {
      id: "1",
      street: "12345678910",
      length: "02.05.2023",
    },
    {
      id: "2",
      street: "12345678910",
      length: "02.05.2023",
    },
    {
      id: "3",
      street: "12345678910",
      length: "02.05.2023",
    },
    {
      id: "4",
      street: "12345678910",
      length: "02.05.2023",
    },
  ];
};
const Streetfronts = ({
  dataIn,
  extractor = mockExtractor,
  width = 231,
  height = 188,
  style,
}) => {
  const isStory = false;
  const storyStyle = { width, height, ...style };
  const dateFormat = "DD.MM.YYYY";
  const data = extractor(dataIn);
  const [streetfronts, setStreetfronts] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const addRow = () => {
    const newRow = {
      id: nanoid(),
      street: "",
      length: "",
    };
    setStreetfronts((prev) => [...prev, newRow]);
    setActiveRow(newRow);
  };
  const deleteRow = () => {
    const updatedArray = streetfronts.filter((row) => row.id !== activeRow?.id);
    setStreetfronts(updatedArray);
    if (activeRow?.id === streetfronts[0].id) {
      setActiveRow(streetfronts[1]);
    } else {
      setActiveRow(streetfronts[0]);
    }
  };
  const editHandle = (updatedObject) => {
    updatedObject.length = updatedObject.length.format("DD.MM.YYYY");
    const targetRow = streetfronts.find((c) => c.id === updatedObject.id);
    const copyRow = {
      ...targetRow,
      street: updatedObject.street,
      length: updatedObject.length,
    };

    setActiveRow(copyRow);
    setStreetfronts(
      streetfronts?.map((obj) => (obj.id === copyRow.id ? copyRow : obj)),
    );
  };
  useEffect(() => {
    const data = extractor(dataIn);
    setStreetfronts(data);
    setActiveRow(data[0]);
  }, [dataIn]);
  return (
    <div
      className="shadow-md"
      style={
        isStory
          ? storyStyle
          : {
              height: "100%",
              borderRadius: "6px",
              backgroundColor: "#ffffff",
              overflow: "auto",
            }
      }
    >
      <InfoBlock
        title={verwaltung.strassen.tableTitle}
        controlBar={
          <ToggleModal
            section="Verwaltungsbereiche"
            name="Straßenfronten"
            addRow={addRow}
            deleteActiveRow={deleteRow}
          >
            <ModalForm
              formName={activeRow?.id}
              updateHandle={editHandle}
              customFields={[
                {
                  title: "Straßen",
                  value: activeRow?.street,
                  id: nanoid(),
                  name: "street",
                },
                {
                  title: "Length",
                  value: activeRow?.length,
                  id: nanoid(),
                  name: "length",
                },
              ]}
            />
          </ToggleModal>
        }
      >
        <div className="relative">
          <TableCustom
            columns={columns}
            data={streetfronts}
            activeRow={activeRow}
            setActiveRow={setActiveRow}
            fixHeight={true}
          />
        </div>
      </InfoBlock>
    </div>
  );
};
export default Streetfronts;
Streetfronts.propTypes = {
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
