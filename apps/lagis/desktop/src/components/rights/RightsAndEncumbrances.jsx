import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import { useEffect, useState } from "react";
import SheetTable from "../editing/SheetTable";
import useDraftTable from "../editing/useDraftTable";
import useStammdatenList from "../editing/useStammdatenList";
import { rebeColumns } from "./rebeColumns";
import { mockExtractor } from "./mockRebes";
import { newRebeRow } from "../../core/editing/rebe";
import { REBE_RULES } from "../../core/editing/validation";
import useInvalidCells from "../editing/useInvalidCells";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import localeData from "dayjs/plugin/localeData";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { rebe } from "@carma-collab/wuppertal/lagis-desktop";
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(customParseFormat);
const RightsAndEncumbrances = ({
  dataIn,
  extractor = mockExtractor,
  width = 231,
  height = 188,
  style,
  setExtraGeom,
  setSelectedTableRowId,
  selectedTableIdByMap,
}) => {
  const isStory = false;
  const storyStyle = { width, height, ...style };
  const [rights, setRghts] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const { editable, locked, draft, actions, tableProps } = useDraftTable({
    section: "rebe",
    field: "rebes",
    newRow: newRebeRow,
  });
  const rebeArten = useStammdatenList("rebeArten", editable);
  const invalid = useInvalidCells("rebe", tableProps.rows, REBE_RULES);
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
        editable={editable}
        locked={locked}
        title={rebe.rebeTable.tableTitle}
        controlBar={actions}
      >
        <div className="overflow-auto">
          <SheetTable
            columns={rebeColumns({ rebeArten, draft, invalid })}
            editable={editable}
            ready={Boolean(rebeArten)}
            view={{ rows: rights, activeRow, setActiveRow }}
            edit={tableProps}
            // view ids are list positions; both lists are ordered by id
            toEditRow={(row) => tableProps.rows[row.id]}
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
