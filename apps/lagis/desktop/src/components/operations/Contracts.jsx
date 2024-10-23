import PropTypes, { object } from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import ToggleModal from "../ui/control-board/ToggleModal";
import TableCustom from "../ui/tables/TableCustom";
import ModalForm from "../ui/forms/ModalForm";
import DocsIcons from "../ui/Blocks/DocsIcons";
import { nanoid } from "@reduxjs/toolkit";
import { useState, useEffect } from "react";
import { compare } from "../../core/tools/helper";
import { vorgange } from "@carma-collab/wuppertal/lagis-desktop";

const columns = [
  {
    title: vorgange.vorgangeTable.vertragsartCol,
    dataIndex: "vertragsart",
    sorter: (a, b) => compare(a.vertragsart, b.vertragsart),
  },
  {
    title: vorgange.vorgangeTable.nummerCol,
    dataIndex: "nummer",
    sorter: (a, b) => compare(a.nummer, b.nummer),
  },
  {
    title: vorgange.vorgangeTable.quadratmeterpreisCol,
    dataIndex: "quadratmeterpreis",
    sorter: (a, b) => compare(a.quadratmeterpreis, b.quadratmeterpreis),
  },
  {
    title: vorgange.vorgangeTable.kaufpreisCol,
    dataIndex: "kaufpreis",
    sorter: (a, b) => compare(a.kaufpreis, b.kaufpreis),
  },
];
const Contracts = ({
  width = 231,
  height = 188,
  style,
  dataIn,
  extractor,
  setActiveDataId,
}) => {
  const [contracts, setContracts] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const handleAddRow = () => {
    const newData = {
      id: nanoid(),
      vertragsart: "",
      nummer: "",
      quadratmeterpreis: "",
      kaufpreis: "",
    };
    setContracts((prev) => [...prev, newData]);
    setActiveRow(newData);
  };
  const handleActiveRow = (rowObject) => {
    setActiveRow(rowObject);
  };
  const deleteActiveRow = () => {
    const updatedArray = contracts.filter((row) => row.id !== activeRow.id);
    setContracts(updatedArray);
    if (activeRow.id === contracts[0].id) {
      setActiveRow(contracts[1]);
    } else {
      setActiveRow(contracts[0]);
    }
  };
  const handleEditActiveContract = (updatedObject) => {
    const targetRow = contracts.find((c) => c.id === updatedObject.id);
    const copyRow = {
      ...targetRow,
      vertragsart: updatedObject.vertragsart,
      nummer: updatedObject.nummer,
      quadratmeterpreis: updatedObject.quadratmeterpreis,
      kaufpreis: updatedObject.kaufpreis,
    };
    setActiveRow(copyRow);
    setContracts(
      contracts.map((obj) => (obj.id === copyRow.id ? copyRow : obj)),
    );
  };
  const isStory = false;
  const storyStyle = { width, height, ...style };
  useEffect(() => {
    const data = extractor(dataIn);
    setContracts(data);
    setActiveRow(data[0]);
  }, [dataIn]);
  useEffect(() => {
    // console.log("active contract row", activeRow);
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
      className="shadow-md overflow-auto h-full"
    >
      <InfoBlock
        title={vorgange.vorgangeTable.vorgangeTitle}
        controlBar={
          <ToggleModal
            section="Verträge"
            addRow={handleAddRow}
            deleteActiveRow={deleteActiveRow}
            modalWidth={900}
            content={
              <DocsIcons classnames="flex justify-center items-center gap-1" />
            }
          >
            <ModalForm
              updateHandle={handleEditActiveContract}
              customFields={[
                {
                  title: "Vertragsart",
                  value: activeRow?.vertragsart,
                  id: nanoid(),
                  name: "vertragsart",
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
                  title: "Nummer",
                  value: activeRow?.nummer,
                  name: "nummer",
                  id: nanoid(),
                },
                {
                  title: "Quadratmeterpreis",
                  id: nanoid(),
                  value: activeRow?.quadratmeterpreis,
                  name: "quadratmeterpreis",
                },
                {
                  title: "Kaufpreis (i. NK)",
                  value: activeRow?.kaufpreis,
                  name: "kaufpreis",
                  id: nanoid(),
                },
              ]}
              formName={activeRow?.id}
            />
          </ToggleModal>
        }
      >
        <div className="relative">
          <TableCustom
            columns={columns}
            data={contracts}
            setActiveRow={setActiveRow}
            activeRow={activeRow}
            fixHeight={true}
            setActiveDataId={setActiveDataId}
          />
        </div>
      </InfoBlock>
    </div>
  );
};

export default Contracts;
Contracts.propTypes = {
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
