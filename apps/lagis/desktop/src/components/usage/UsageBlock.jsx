import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import SheetTable from "../editing/SheetTable";
import useDraftTable from "../editing/useDraftTable";
import useStammdatenList from "../editing/useStammdatenList";
import useInvalidCells from "../editing/useInvalidCells";
import { USAGE_RULES } from "../../core/editing/validation";
import { useState, useEffect } from "react";
import { newUsageRow } from "../../core/wizard/usageData";
import { useSelector } from "react-redux";
import { getOriginalSection } from "../../store/slices/editing";
import { nutzung } from "@carma-collab/wuppertal/lagis-desktop";
import { NUTZUNG_SCROLL, nutzungColumns } from "./nutzungColumns";
import { mockExtractor } from "./mockUsages";

const UsageBlock = ({
  dataIn,
  extractor = mockExtractor,
  width = 231,
  height = 188,
  style,
}) => {
  const isStory = false;
  const storyStyle = { width, height, ...style };
  const [usage, setUsage] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const { editable, actions, tableProps } = useDraftTable({
    section: "usage",
    field: "nutzungen",
    newRow: () => newUsageRow(),
  });
  const stammdaten = useStammdatenList("nutzung", editable);
  const originalUsage = useSelector(getOriginalSection("usage"));
  const invalid = useInvalidCells("usage", tableProps.rows, USAGE_RULES);
  const originalById = new Map(
    (originalUsage?.nutzungen ?? []).map((row) => [row.id, row])
  );
  useEffect(() => {
    // same order as the edit rows (loadUsageSection)
    const data = [...extractor(dataIn)].sort((a, b) => a.id - b.id);
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
        editable={editable}
        title={nutzung.nutzungTable.tableTitle}
        controlBar={actions}
      >
        <div className="relative">
          <SheetTable
            columns={nutzungColumns({ stammdaten, originalById, invalid })}
            editable={editable}
            ready={Boolean(stammdaten)}
            fixHeight
            scroll={NUTZUNG_SCROLL}
            className="nfk-cover"
            view={{ rows: usage, activeRow, setActiveRow }}
            edit={tableProps}
            toEditRow={(row) =>
              tableProps.rows.find((draftRow) => draftRow.id === String(row.id))
            }
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
