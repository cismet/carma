import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import ToggleModal from "../ui/control-board/ToggleModal";
import TableCustom from "../ui/tables/TableCustom";
import ModalForm from "../ui/forms/ModalForm";
import { Row, Col, Tag } from "antd";
import CustomNotes from "../ui/notes/CustomNotes";
// import CustomH3 from "../ui/titles/CustomH3";
import { useEffect, useState } from "react";
import { nanoid } from "@reduxjs/toolkit";
import { compare } from "../../core/tools/helper";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import localeData from "dayjs/plugin/localeData";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { mipa } from "@carma-collab/wuppertal/lagis-desktop";
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(customParseFormat);
const columns = [
  {
    title: mipa.mipaTable.lageCol,
    dataIndex: "lage",
    sorter: (a, b) => compare(a.lage, b.lage),
  },
  {
    title: mipa.mipaTable.aktenzeichenCol,
    dataIndex: "aktenzeichen",
    sorter: (a, b) => compare(a.aktenzeichen, b.aktenzeichen),
  },
  {
    title: mipa.mipaTable.flaecheCol,
    dataIndex: "flaeche",
    sorter: (a, b) => compare(a.flaeche, b.flaeche),
  },
  {
    title: mipa.mipaTable.nutzungCol,
    dataIndex: "nutzung",
    sorter: (a, b) => compare(a.nutzung, b.nutzung),
  },
  {
    title: mipa.mipaTable.vertragsbeginCol,
    dataIndex: "vertragsbegin",
    sorter: (a, b) => compare(a.vertragsbegin, b.vertragsbegin),
  },
  {
    title: mipa.mipaTable.vertragsendeCol,
    dataIndex: "vertragsende",
    sorter: (a, b) => compare(a.vertragsende, b.vertragsende),
  },
  {
    title: mipa.mipaTable.merkmaleCol,
    dataIndex: "merkmale",
    id: "merkmale",
    render: (merkmale) => (
      <>
        {merkmale.map((m, i) => (
          <Tag key={i} color={i % 2 === 0 ? "green" : "red"}>
            {m.mipa_merkmal.bezeichnung}
          </Tag>
        ))}
      </>
    ),
    sorter: (a, b) => compare(a.merkmale, b.merkmale),
  },
];
const mockExtractor = (input) => {
  return [
    {
      id: "1",
      lage: "Luntenbecker",
      aktenzeichen: "3434534",
      flaeche: "237",
      nutzung: "Other",
      vertragsbegin: "02.05.2023",
      vertragsende: "02.05.2023",
      merkmale: [
        { text: "Altlast", color: "gold" },
        { text: "Biotop", color: "cyan" },
      ],
      querverweise: "Querverweise 1",
      note: "Bemerkung 1",
    },
    {
      id: "2",
      lage: "Luntenbecker",
      aktenzeichen: "3434534",
      flaeche: "237",
      nutzung: "Other",
      vertragsbegin: "02.05.2023",
      vertragsende: "02.05.2023",
      merkmale: [{ text: "Unentgeltlich", color: "gold" }],
      querverweise: "Querverweise 2",
      note: "Bemerkung 2",
    },
    {
      id: "3",
      lage: "Luntenbecker",
      aktenzeichen: "3434534",
      flaeche: "237",
      nutzung: "Other",
      vertragsbegin: "02.05.2023",
      vertragsende: "02.05.2023",
      merkmale: [{ text: "keine Akte", color: "cyan" }],
      querverweise: "Querverweise 3",
      note: "Bemerkung 3",
    },
    {
      id: "4",
      lage: "Luntenbecker",
      aktenzeichen: "3434534",
      flaeche: "237",
      nutzung: "Other",
      vertragsbegin: "02.05.2023",
      vertragsende: "02.05.2023",
      merkmale: [
        { text: "Altlast", color: "gold" },
        { text: "keine Akte", color: "cyan" },
      ],
      querverweise: "Querverweise 4",
      note: "Bemerkung 4",
    },
  ];
};
const RentBlock = ({
  dataIn,
  extractor = mockExtractor,
  width = 231,
  height = 188,
  style,
  setExtraRentsGeom,
  selectedTableRowId,
  setSelectedTableRowId,
  selectedTableIdByMap,
}) => {
  const isStory = false;
  const storyStyle = { width, height, ...style };
  const dateFormat = "DD.MM.YYYY";
  const [rents, setRents] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const addRow = () => {
    const newRow = {
      id: nanoid(),
      lage: "",
      aktenzeichen: "",
      flaeche: "",
      nutzung: "",
      vertragsbegin: "",
      vertragsende: "",
      merkmale: [
        { text: "", color: "gold" },
        { text: "", color: "cyan" },
      ],
    };
    setRents((prev) => [...prev, newRow]);
    setActiveRow(newRow);
  };
  const deleteRow = () => {
    const updatedArray = rents.filter((row) => row.id !== activeRow?.id);
    setRents(updatedArray);
    if (activeRow?.id === rents[0].id) {
      setActiveRow(rents[1]);
    } else {
      setActiveRow(rents[0]);
    }
  };
  useEffect(() => {
    const data = extractor(dataIn);
    setRents(data);
    setActiveRow(data[0]);
  }, [dataIn]);
  useEffect(() => {
    if (
      selectedTableIdByMap !== null &&
      selectedTableIdByMap !== activeRow.id
    ) {
      setActiveRow(rents[selectedTableIdByMap]);
    }
  }, [selectedTableIdByMap]);
  useEffect(() => {
    if (activeRow) {
      const { id } = activeRow;
      setExtraRentsGeom(rents);
      setSelectedTableRowId(id);
    }
  }, [activeRow]);
  return (
    <div
      style={
        isStory
          ? storyStyle
          : {
              backgroundColor: "#FFFFFF",
              borderRadius: "6px",
            }
      }
      className="h-full"
    >
      <div className="h-[60%]">
        <InfoBlock
          title={mipa.mipaTable.tableTitle}
          controlBar={
            <ToggleModal
              section="Vermietung / Verpachtung"
              modalWidth={900}
              addRow={addRow}
              deleteActiveRow={deleteRow}
            >
              <ModalForm
                formName={activeRow?.id}
                customFields={[
                  {
                    title: "Lage",
                    value: activeRow?.lage,
                    id: nanoid(),
                    name: "lage",
                  },
                  {
                    title: "Aktenzeichen",
                    value: activeRow?.aktenzeichen,
                    id: nanoid(),
                    name: "aktenzeichen",
                  },
                  {
                    title: "Flaeche m2",
                    value: activeRow?.flaeche,
                    id: nanoid(),
                    name: "flaeche",
                  },
                  {
                    title: "Nutzung",
                    value: activeRow?.nutzung,
                    id: nanoid(),
                    name: "aktenzeichen",
                  },
                  {
                    title: "Vertragsbegin",
                    id: nanoid(),
                    value:
                      activeRow?.vertragsbegin === ""
                        ? null
                        : dayjs(activeRow?.vertragsbegin, dateFormat),
                    name: "nutzung",
                    type: "date",
                  },
                  {
                    title: "Vertragsende",
                    id: nanoid(),
                    name: "vertragsende",
                    value:
                      activeRow?.vertragsende === ""
                        ? null
                        : dayjs(activeRow?.vertragsende, dateFormat),
                    type: "date",
                  },
                ]}
                size={8}
                buttonPosition={{ justifyContent: "end" }}
                // tagsBar={[1]}
              />
            </ToggleModal>
          }
        >
          <div className="overflow-auto">
            <TableCustom
              columns={columns}
              data={rents}
              activeRow={activeRow}
              setActiveRow={setActiveRow}
              selectedFeatureKey={"selectedTableGeom"}
            />
          </div>
        </InfoBlock>
      </div>
      <div className="h-[40%] flex gap-4 overflow-auto">
        <div className="w-full">
          <InfoBlock
            title={mipa.bemerkung.title}
            controlBar={
              <ToggleModal onlyEdit={true} section="Bemerkung">
                <ModalForm
                  formName={activeRow?.id}
                  // updateHandle={handleEdit}
                  customFields={[
                    {
                      title: "Bemerkung",
                      value: activeRow?.note,
                      id: nanoid(),
                      name: "note",
                      type: "note",
                    },
                  ]}
                />
              </ToggleModal>
            }
          >
            <CustomNotes
              styles={"pt-2 pl-2 pb-2"}
              currentText={activeRow?.note}
            />
          </InfoBlock>
        </div>
        <div className="w-full">
          <InfoBlock
            title={mipa.querverweise.title}
            controlBar={
              <ToggleModal onlyEdit={true} section="Querverweise">
                <ModalForm
                  formName={activeRow?.id}
                  // updateHandle={handleEdit}
                  customFields={[
                    {
                      title: "Querverweise",
                      value: activeRow?.querverweise,
                      id: nanoid(),
                      name: "querverweise",
                      type: "note",
                    },
                  ]}
                />
              </ToggleModal>
            }
          >
            <CustomNotes
              styles={"pt-2 pr-2 pb-2"}
              currentText={activeRow?.querverweise}
            />
          </InfoBlock>
        </div>
      </div>
    </div>
  );
};

export default RentBlock;
RentBlock.propTypes = {
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
