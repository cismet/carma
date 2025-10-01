import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import ToggleModal from "../ui/control-board/ToggleModal";
import TableCustom from "../ui/tables/TableCustom";
import ModalForm from "../ui/forms/ModalForm";
import DocsIcons from "../ui/Blocks/DocsIcons";
import { useState, useEffect } from "react";
import { nanoid } from "@reduxjs/toolkit";
import { compare } from "../../core/tools/helper";
import {
  CloseCircleOutlined,
  IssuesCloseOutlined,
  FlagOutlined,
} from "@ant-design/icons";
import { nutzung } from "@carma-collab/wuppertal/lagis-desktop";
import { Tooltip } from "antd";
const columns = [
  {
    title: nutzung.nutzungTable.nutzungCol,
    dataIndex: "nutzung",
    sorter: (a, b) => compare(a.nutzung, b.nutzung),
  },
  {
    title: nutzung.nutzungTable.buchungsCol,
    dataIndex: "buchungs",
    sorter: (a, b) => compare(a.buchungs, b.buchungs),
  },
  {
    title: nutzung.nutzungTable.anlageklasseCol,
    dataIndex: "anlageklasse",
    render: (record, row) => {
      return (
        <div className="flex items-center justify-center">
          <Tooltip title={row.anlageklasseKey}>{record}</Tooltip>
        </div>
      );
    },
    sorter: (a, b) => compare(a.anlageklasse, b.anlageklasse),
  },
  // {
  //   title: "Nutzungsart",
  //   dataIndex: "nutzungsart",
  // },
  {
    title: nutzung.nutzungTable.bezeichnungCol,
    dataIndex: "bezeichnung",
    sorter: (a, b) => compare(a.bezeichnung, b.bezeichnung),
  },
  {
    title: nutzung.nutzungTable.flacheCol,
    dataIndex: "fläche",
    sorter: (a, b) => compare(a.fläche, b.fläche),
  },
  {
    title: nutzung.nutzungTable.preisCol,
    dataIndex: "preis",
    sorter: (a, b) => compare(a.preis, b.preis),
  },
  {
    title: nutzung.nutzungTable.gesamtpreisCol,
    dataIndex: "gesamtpreis",
    sorter: (a, b) => compare(a.gesamtpreis, b.gesamtpreis),
  },
  {
    title: nutzung.nutzungTable.stilleCol,
    dataIndex: "stille",
    sorter: (a, b) => compare(a.stille, b.stille),
  },
  {
    title: nutzung.nutzungTable.buchwertCol,
    dataIndex: "buchwert",
    render: (record) => (
      <div className="flex items-center justify-center">
        {record ? (
          <FlagOutlined style={{ color: "green" }} />
        ) : (
          <FlagOutlined style={{ color: "red" }} />
        )}
      </div>
    ),
    sorter: (a, b) => compare(a.buchwert, b.buchwert),
  },
  {
    title: nutzung.nutzungTable.bemerkungCol,
    dataIndex: "bemerkung",
    sorter: (a, b) => compare(a.bemerkung, b.bemerkung),
  },
];
const mockExtractor = (input) => {
  return [
    {
      id: "1",
      nutzung: "237284656",
      buchungs: "1",
      anlageklasse: "Infrastrukturvermögen Grundstücke",
      nutzungsart: "3273-12376",
      bezeichnung: "3273-12376",
      fläche: "2132",
      preis: "38274€",
      gesamtpreis: "38274€",
      stille: "Stille 1",
      buchwert: "Buchwert 1",
      bemerkung: "Bemerkung 1",
    },
    {
      id: "2",
      nutzung: "746",
      buchungs: "1",
      anlageklasse: "Infrastrukturvermögen Grundstücke",
      nutzungsart: "3273-12376",
      bezeichnung: "3273-12376",
      fläche: "2132",
      preis: "38274€",
      gesamtpreis: "38274€",
      stille: "",
      buchwert: "",
      bemerkung: "",
    },
    {
      id: "3",
      nutzung: "2372846",
      buchungs: "1",
      anlageklasse: "Infrastrukturvermögen Grundstücke",
      nutzungsart: "3273-12376",
      bezeichnung: "3273-12376",
      fläche: "2132",
      preis: "38274€",
      gesamtpreis: "38274€",
      stille: "",
      buchwert: "",
      bemerkung: "",
    },
    {
      id: "4",
      nutzung: "2372846",
      buchungs: "1",
      anlageklasse: "Infrastrukturvermögen Grundstücke",
      nutzungsart: "3273-12376",
      bezeichnung: "3273-12376",
      fläche: "2132",
      preis: "38274€",
      gesamtpreis: "38274€",
      stille: "",
      buchwert: "",
      bemerkung: "",
    },
  ];
};

const UsageBlock = ({
  dataIn,
  extractor = mockExtractor,
  width = 231,
  height = 188,
  style,
}) => {
  // const data = extractor(dataIn);
  const isStory = false;
  const storyStyle = { width, height, ...style };
  const [usage, setUsage] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const addRow = () => {
    const newRow = {
      id: nanoid(),
      nutzung: "",
      buchungs: "",
      anlageklasse: "",
      nutzungsart: "",
      bezeichnung: "",
      fläche: "",
      preis: "",
      gesamtpreis: "",
      stille: "",
      buchwert: "",
      bemerkung: "",
    };
    setUsage((prev) => [...prev, newRow]);
    setActiveRow(newRow);
  };
  const deleteRow = () => {
    const updatedArray = usage.filter((row) => row.id !== activeRow?.id);
    setUsage(updatedArray);
    if (activeRow?.id === usage[0].id) {
      setActiveRow(usage[1]);
    } else {
      setActiveRow(usage[0]);
    }
  };
  useEffect(() => {
    const data = extractor(dataIn);
    setUsage(data);
    setActiveRow(data[0]);
  }, [dataIn]);
  return (
    <div
      style={
        isStory
          ? storyStyle
          : {
              height: "100%",
              backgroundColor: "#FFFFFF",
              borderRadius: "6px",
            }
      }
      className="shadow-md overflow-auto"
    >
      <InfoBlock
        title={nutzung.nutzungTable.tableTitle}
        controlBar={
          <ToggleModal
            section="Nutzung"
            addRow={addRow}
            deleteActiveRow={deleteRow}
            content={<DocsIcons classnames="mr-4 flex gap-1" />}
            modalWidth={900}
          >
            <ModalForm
              formName={activeRow?.id}
              customFields={[
                {
                  title: "Nutzung Nr",
                  value: activeRow?.nutzung,
                  id: nanoid(),
                  name: "nutzung",
                },
                {
                  title: "Buchungs-Nr",
                  value: activeRow?.buchungs,
                  id: nanoid(),
                  name: "buchungs",
                },
                {
                  title: "Anlageklasse",
                  value: activeRow?.anlageklasse,
                  id: nanoid(),
                  name: "anlageklasse",
                },
                // {
                //   title: "Nutzungsart",
                //   value: activeRow?.nutzungsart,
                //   id: nanoid(),
                //   name: "nutzungsart",
                // },
                {
                  title: "Nutzungsarten-Bezeichnung",
                  value: activeRow?.bezeichnung,
                  id: nanoid(),
                  name: "bezeichnung",
                },
                {
                  title: "Fläche/m2",
                  value: activeRow?.fläche,
                  id: nanoid(),
                  name: "fläche",
                },
                {
                  title: "m2 Preis",
                  value: activeRow?.preis,
                  id: nanoid(),
                  name: "preis",
                },
                {
                  title: "Gesamtpreis",
                  value: activeRow?.gesamtpreis,
                  id: nanoid(),
                  name: "gesamtpreis",
                },
                {
                  title: "Buchwert",
                  value: activeRow?.buchwert,
                  id: nanoid(),
                  name: "buchwert",
                },
                {
                  title: "Stille Reserve",
                  value: activeRow?.stille,
                  id: nanoid(),
                  name: "stille",
                },
                {
                  title: "Bemerkung",
                  value: activeRow?.bemerkung,
                  id: nanoid(),
                  name: "bemerkung",
                  type: "note",
                },
              ]}
              size={8}
              buttonPosition={{ justifyContent: "end" }}
            />
          </ToggleModal>
        }
      >
        <div className="relative">
          <TableCustom
            columns={columns}
            data={usage}
            activerow={setActiveRow}
            addClass="nfk-cover"
            activeRow={activeRow}
            setActiveRow={setActiveRow}
            fixHeight={true}
          />
        </div>
      </InfoBlock>
    </div>
  );
};

export default UsageBlock;
UsageBlock.propTypes = {
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
