import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import { Tabs } from "antd";
import TableCustom from "../ui/tables/TableCustom";
import CustomNotes from "../ui/notes/CustomNotes";
import ToggleModal from "../ui/control-board/ToggleModal";
import ModalForm from "../ui/forms/ModalForm";
import { useEffect, useState } from "react";
import "./operations.css";
import { nanoid } from "@reduxjs/toolkit";
import { compare } from "../../core/tools/helper";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import localeData from "dayjs/plugin/localeData";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { vorgange } from "@carma-collab/wuppertal/lagis-desktop";

dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(customParseFormat);

const { TabPane } = Tabs;
const columns = [
  {
    title: "Beschlussart",
    dataIndex: "beschlussart",
  },
  {
    title: "Datum",
    dataIndex: "datum",
  },
];
const columnsCosts = [
  {
    title: vorgange.qkb.kostenartCol,
    dataIndex: "kostenart",
  },
  {
    title: vorgange.qkb.betragCol,
    dataIndex: "betrag",
  },
  {
    title: vorgange.qkb.anweisungCol,
    dataIndex: "anweisung",
  },
];
const CrossReferences = ({
  activeRow,
  dataIn,
  extractor,
  crossExtractor,
  jwt,
  setActiveRow,
}) => {
  const [kosten, setKosten] = useState([]);
  // const [resolution, setResolution] = useState(activeRow.resolution);
  const [activecCosts, setActiveCosts] = useState();
  const [querverweise, setQuerverweise] = useState();
  // const [activeResolution, setActiveResolution] = useState(
  //   activeRow.resolution[0]
  // );
  const [activeTabe, setActiveTab] = useState("1");
  const dateFormat = "DD.MM.YYYY";
  const costFields = [
    {
      title: "Kostenart",
      value: activecCosts?.kostenart,
      id: nanoid(),
      name: "kostenart",
      type: "select",
      options: [
        {
          value: "Vermietung",
          lable: "Vermietung",
        },
        {
          value: "Leasing",
          lable: "Leasing",
        },
      ],
    },
    {
      title: "Betrag",
      value: activecCosts?.betrag,
      name: "betrag",
      id: nanoid(),
    },
    {
      title: "Anweisung",
      id: nanoid(),
      name: "anweisung",
      type: "date",
      value:
        activecCosts?.anweisung === ""
          ? null
          : dayjs(activecCosts?.anweisung, dateFormat),
    },
  ];
  // const resolutionsFields = [
  //   {
  //     title: "Beschlussart",
  //     value: activeResolution?.beschlussart,
  //     name: "beschlussart",
  //     id: nanoid(),
  //     type: "select",
  //     options: [
  //       {
  //         value: "Vermietung",
  //         lable: "Vermietung",
  //       },
  //       {
  //         value: "Leasing",
  //         lable: "Leasing",
  //       },
  //     ],
  //   },
  //   {
  //     title: "Datum",
  //     value: activeResolution?.datum,
  //     value:
  //       activeResolution?.datum === ""
  //         ? null
  //         : dayjs(activeResolution?.datum, dateFormat),
  //     name: "datum",
  //     type: "date",
  //     id: nanoid(),
  //   },
  // ];
  const querverweiseField = [
    {
      title: "Querverweise",
      value: querverweise?.join("\n") || "",
      id: nanoid(),
      name: "querverweise",
      type: "note",
    },
  ];
  const handleActiveCosts = (rowObject) => {
    setActiveCosts(rowObject);
  };
  const handleAddRow = () => {
    if (activeTabe === "2") {
      const newData = {
        id: nanoid(),
        kostenart: "",
        betrag: "",
        anweisung: "",
      };
      setKosten((prev) => [...prev, newData]);
      setActiveCosts(newData);
    }

    if (activeTabe === "3") {
      const newData = {
        id: nanoid(),
        beschlussart: "",
        datum: "",
      };
      // setResolution((prev) => [...prev, newData]);
      // setActiveResolution(newData);
    }
  };
  const handleEditActiveKosten = (updatedObject) => {
    updatedObject.betrag = updatedObject.betrag.format("DD.MM.YYYY");
    updatedObject.anweisung = updatedObject.anweisung.format("DD.MM.YYYY");
    setKosten(
      kosten.map((k) => (k.id === updatedObject.id ? updatedObject : k)),
    );
  };
  const handleEditActiveResolution = (updatedObject) => {
    // updatedObject.datum = updatedObject.datum.format("DD.MM.YYYY");
    // setResolution(
    //   resolution.map((r) => (r.id === updatedObject.id ? updatedObject : r))
    // );
  };
  const deleteActiveRow = () => {
    if (activeTabe === "2" && activecCosts) {
      const updatedArray = kosten.filter((k) => k.id !== activecCosts.id);
      setKosten(updatedArray);
      activecCosts.id !== kosten[0].id
        ? setActiveCosts(kosten[0])
        : setActiveCosts(kosten[1]);
    }
    // if (activeTabe === "3" && activeResolution) {
    //   const updatedArray = resolution.filter(
    //     (r) => r.id !== activeResolution.id
    //   );
    //   setResolution(updatedArray);
    //   activeResolution.id !== kosten[0].id
    //     ? setActiveResolution(resolution[0])
    //     : setActiveResolution(resolution[1]);
    // }
  };
  const handleEditNotes = (updatedObject) => {
    const targetRow = dataContract.find((c) => c.id === activeRow.id);
    const copyRow = {
      ...targetRow,
      querverweise: updatedObject.querverweise,
    };
    setActiveRow(copyRow);
    setDataContract(
      dataContract.map((obj) => (obj.id === copyRow.id ? copyRow : obj)),
    );
  };

  const crossData = async () => {
    const crossData = await crossExtractor(dataIn, jwt);
    setQuerverweise(crossData);
  };
  useEffect(() => {
    const data = extractor(dataIn);
    crossData();
    setKosten(data);
    setActiveCosts(data[0]);
  }, [dataIn]);
  return (
    <div
      className="cross-data h-full shadow-md"
      style={{
        height: "100%",
        backgroundColor: "#ffffff",
        borderRadius: "6px",
      }}
    >
      <InfoBlock
        title={vorgange.qkb.title}
        controlBar={
          <ToggleModal
            section={
              activeTabe === "1"
                ? "Querverweise"
                : activeTabe === "2"
                ? "Kosten"
                : "Beschlüsse"
            }
            addRow={handleAddRow}
            deleteActiveRow={deleteActiveRow}
          >
            <ModalForm
              // updateHandle={
              //   activeTabe === "1"
              //     ? handleEditNotes
              //     : activeTabe === "2"
              //     ? handleEditActiveKosten
              //     : handleEditActiveResolution
              // }
              // formName={
              //   activeTabe === "1"
              //     ? activeRow.id
              //     : activeTabe === "2"
              //     ? activecCosts?.id
              //     : activeResolution?.id
              // }
              customFields={
                activeTabe === "1"
                  ? querverweiseField
                  : activeTabe === "2"
                  ? costFields
                  : resolutionsFields
              }
              size={24}
              buttonPosition={{ justifyContent: "end" }}
              tagsBar={[]}
            />
          </ToggleModal>
        }
      >
        <Tabs
          defaultActiveKey="1"
          size="small"
          style={{ padding: "0 18px" }}
          onChange={(activeKey) => setActiveTab(activeKey)}
          className="overflow-hidden"
        >
          <TabPane tab={vorgange.qkb.querverweiseTitle} key="1">
            <CustomNotes currentText={querverweise?.join("\n")} />
          </TabPane>
          <TabPane
            tab={vorgange.qkb.kostenTitle}
            key="2"
            className="overflow-y-auto"
          >
            <div className="flex">
              <TableCustom
                columns={columnsCosts}
                data={kosten}
                activeRow={activecCosts}
                setActiveRow={handleActiveCosts}
              />
            </div>
          </TabPane>
          {/* <TabPane tab="Beschlüsse" key="3">
            <TableCustom
              columns={columns}
              data={resolution}
              setActiveRow={setActiveResolution}
              activeRow={activeResolution}
            />
          </TabPane> */}
        </Tabs>
      </InfoBlock>
    </div>
  );
};

export default CrossReferences;
CrossReferences.propTypes = {
  /**
   * The current main data object that is being used
   */
  dataIn: PropTypes.object,
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
