import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import ToggleModal from "../ui/control-board/ToggleModal";
import TableCustom from "../ui/tables/TableCustom";
import ModalForm from "../ui/forms/ModalForm";
import { EuroCircleOutlined } from "@ant-design/icons";
import { Button, Tag, Tooltip } from "antd";
import { useState, useEffect } from "react";
import { nanoid } from "@reduxjs/toolkit";
import { compare, formatPrice } from "../../core/tools/helper";
import { nutzung } from "@carma-collab/wuppertal/lagis-desktop";

const columns = [
  {
    title: nutzung.overviewTable.anlageklasseCol,
    dataIndex: "anlageklasse",
    render: (record, row) => {
      return <Tooltip title={row.anlageklasseKey}>{record}</Tooltip>;
    },
    sorter: (a, b) => compare(a.anlageklasse, b.anlageklasse),
  },
  {
    title: nutzung.overviewTable.summeCol,
    dataIndex: "summe",
    sorter: (a, b) => compare(a.summe, b.summe),
  },
];
const mockExtractor = (input) => {
  return [
    {
      id: "1",
      anlageklasse: "12345678910",
      summe: "2609.10 €",
    },
    {
      id: "2",
      anlageklasse: "12345678910",
      summe: "2609.10 €",
    },
    {
      id: "3",
      anlageklasse: "12345678910",
      summe: "2609.10 €",
    },
    {
      id: "4",
      anlageklasse: "12345678910",
      summe: "2609.10 €",
    },
  ];
};
const NFKOverwie = ({
  dataIn,
  extractor = mockExtractor,
  width = 231,
  height = 188,
  style,
}) => {
  // const data = extractor(dataIn);
  const isStory = false;
  const storyStyle = { width, height, ...style };
  const [dataTable, setDataTable] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const addRow = () => {
    const newRow = {
      id: nanoid(),
      anlageklasse: "",
      summe: "",
    };
    setDataTable((prev) => [...prev, newRow]);
    setActiveRow(newRow);
  };
  const deleteRow = () => {
    const updatedArray = dataTable.filter((row) => row.id !== activeRow?.id);
    setDataTable(updatedArray);
    if (activeRow?.id === dataTable[0].id) {
      setActiveRow(dataTable[1]);
    } else {
      setActiveRow(dataTable[0]);
    }
  };
  useEffect(() => {
    const data = extractor(dataIn);
    setDataTable(data);
    setActiveRow(data[0]);
  }, [dataIn]);
  return (
    <div
      style={
        isStory
          ? storyStyle
          : {
              height: "100%",
              borderRadius: "6px",
              backgroundColor: "white",
            }
      }
      className="shadow-md overflow-auto"
    >
      <InfoBlock
        title={nutzung.overviewTable.tableTitle}
        titleAction={
          <Tag
            bordered={false}
            color="blue"
            style={{ padding: "0.1rem 0.8rem" }}
          >
            Stille Reserve: {activeRow?.stille ? activeRow?.stille : `0,00 €`}
          </Tag>
        }
        controlBar={
          <ToggleModal
            addRow={addRow}
            deleteActiveRow={deleteRow}
            section="Nutzung"
            name="NKF Overview"
            content={
              <div className="mr-auto">
                <Button
                  type="primary"
                  size="small"
                  icon={<EuroCircleOutlined />}
                >
                  Buchen
                </Button>
              </div>
            }
          >
            <ModalForm
              formName={activeRow?.id}
              customFields={[
                {
                  title: "Anlageklasse",
                  value: activeRow?.anlageklasse,
                  id: nanoid(),
                  name: "anlageklasse",
                },
                {
                  title: "Summe",
                  value: activeRow?.summe,
                  id: nanoid(),
                  name: "summe",
                },
              ]}
              size={24}
            />
          </ToggleModal>
        }
      >
        <div className="relative">
          <TableCustom
            columns={columns}
            data={dataTable}
            activeRow={activeRow}
            setActiveRow={setActiveRow}
          />
        </div>
      </InfoBlock>
    </div>
  );
};

export default NFKOverwie;
NFKOverwie.propTypes = {
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
