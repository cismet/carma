import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import CustomNotes from "../ui/notes/CustomNotes";
import SheetTable from "../editing/SheetTable";
import { mipaColumns } from "./mipaColumns";
import { mockExtractor } from "./mockMipas";
import useDraftTable from "../editing/useDraftTable";
import useStammdatenList from "../editing/useStammdatenList";
import { newMipaRow } from "../../core/editing/mipa";
import { MIPA_RULES } from "../../core/editing/validation";
import useInvalidCells from "../editing/useInvalidCells";
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import localeData from "dayjs/plugin/localeData";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { mipa } from "@carma-collab/wuppertal/lagis-desktop";
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(customParseFormat);
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
  const [rents, setRents] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const { editable, actions, tableProps } = useDraftTable({
    section: "mipa",
    field: "mipas",
    newRow: (draft) => newMipaRow(draft.parcelGeometry),
  });
  const stammdaten = useStammdatenList("mipa", editable);
  const invalid = useInvalidCells("mipa", tableProps.rows, MIPA_RULES);
  const activeDraftRow = tableProps.rows.find(
    (row) => row.id === tableProps.activeId
  );
  const updateBemerkung = (bemerkung) =>
    tableProps.onChange(
      tableProps.rows.map((row) =>
        row.id === activeDraftRow.id ? { ...row, bemerkung } : row
      )
    );
  useEffect(() => {
    const data = extractor(dataIn);
    setRents(data);
    setActiveRow(data[0]);
  }, [dataIn]);
  useEffect(() => {
    if (
      selectedTableIdByMap !== null &&
      selectedTableIdByMap !== activeRow?.id
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
          editable={editable}
          title={mipa.mipaTable.tableTitle}
          controlBar={actions}
        >
          <div className="overflow-auto">
            <SheetTable
              columns={mipaColumns({ stammdaten, invalid })}
              editable={editable}
              ready={Boolean(stammdaten)}
              view={{ rows: rents, activeRow, setActiveRow }}
              edit={tableProps}
              toEditRow={(row) => tableProps.rows[row.id]}
            />
          </div>
        </InfoBlock>
      </div>
      <div className="h-[40%] flex gap-4 overflow-auto">
        <div className="w-full">
          <InfoBlock editable={editable} title={mipa.bemerkung.title}>
            {editable ? (
              <CustomNotes
                styles={"pt-2 pl-2 pb-2"}
                ifDisable={!activeDraftRow}
                currentText={activeDraftRow?.bemerkung ?? ""}
                onChange={updateBemerkung}
              />
            ) : (
              <CustomNotes
                styles={"pt-2 pl-2 pb-2"}
                currentText={activeRow?.note}
              />
            )}
          </InfoBlock>
        </div>
        <div className="w-full">
          <InfoBlock title={mipa.querverweise.title}>
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
