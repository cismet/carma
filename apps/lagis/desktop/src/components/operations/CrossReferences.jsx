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
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import localeData from "dayjs/plugin/localeData";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { vorgange } from "@carma-collab/wuppertal/lagis-desktop";
import { useSearchParams } from "react-router-dom";
import { convertLParcelStrToSetUrlParams } from "../../core/tools/helper";

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
  const [urlParams, setUrlParams] = useSearchParams();

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
  const handleCrossReferenceClick = (q) => {
    const searchParamsObj = convertLParcelStrToSetUrlParams(q);
    setUrlParams(searchParamsObj);
  };
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
    }
  };

  const deleteActiveRow = () => {
    if (activeTabe === "2" && activecCosts) {
      const updatedArray = kosten.filter((k) => k.id !== activecCosts.id);
      setKosten(updatedArray);
      activecCosts.id !== kosten[0].id
        ? setActiveCosts(kosten[0])
        : setActiveCosts(kosten[1]);
    }
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
      className="cross-data h-full shadow-md pb-8"
      style={{
        height: "100%",
        backgroundColor: "#ffffff",
        borderRadius: "6px",
        overflow: "hidden",
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
          style={{ padding: "0 18px", height: "100%" }}
          onChange={(activeKey) => setActiveTab(activeKey)}
        >
          <TabPane
            tab={
              <span className="inline-block py-2">
                {vorgange.qkb.querverweiseTitle}
              </span>
            }
            key="1"
            className="overflow-y-auto pb-2"
          >
            {querverweise && querverweise?.length > 0 ? (
              querverweise?.map((q, idx) => (
                <div key={idx}>
                  <a
                    href={q}
                    onClick={(e) => {
                      e.preventDefault();
                      handleCrossReferenceClick(q);
                    }}
                    className="text-blue-600 underline hover:text-blue-800"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {q}
                  </a>
                </div>
              ))
            ) : (
              <CustomNotes currentText={""} />
            )}
          </TabPane>
          <TabPane
            tab={
              <span className="inline-block py-2">
                {vorgange.qkb.kostenTitle}
              </span>
            }
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
