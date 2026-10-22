import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import { Button, message, Space, Tooltip } from "antd";
import { useEffect, useState } from "react";
import SheetTable from "../editing/SheetTable";
import useDraftTable from "../editing/useDraftTable";
import useInvalidCells from "../editing/useInvalidCells";
import { kassenzeichenColumns } from "./kassenzeichenColumns";
import { mockExtractor } from "./mockKassenzeichen";
import {
  findKassenzeichenInParcel,
  newKassenzeichenRow,
} from "../../core/editing/kassenzeichen";
import { useSelector } from "react-redux";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { getGeometry } from "../../store/slices/lagis";
import { getJWT } from "../../store/slices/auth";
import {
  duplicateKassenzeichen,
  KASSENZEICHEN_RULES,
} from "../../core/editing/validation";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import localeData from "dayjs/plugin/localeData";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { kassenzeichen } from "@carma-collab/wuppertal/lagis-desktop";

dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(customParseFormat);

const TransactionNumber = ({
  dataIn,
  extractor = mockExtractor,
  width = 231,
  height = 188,
  style,
}) => {
  const isStory = false;
  const storyStyle = { width, height, ...style };
  const [transaction, setTransaction] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const { editable, actions, tableProps } = useDraftTable({
    section: "kassenzeichen",
    field: "kassenzeichen",
    newRow: newKassenzeichenRow,
  });
  const invalidCell = useInvalidCells(
    "kassenzeichen",
    tableProps.rows,
    KASSENZEICHEN_RULES
  );
  const geometry = useSelector(getGeometry);
  const jwt = useSelector(getJWT);
  const [searching, setSearching] = useState(false);
  const duplicates = duplicateKassenzeichen(tableProps.rows);

  const addFromParcel = async () => {
    setSearching(true);
    try {
      const found = await findKassenzeichenInParcel(geometry, jwt);
      const present = new Set(tableProps.rows.map((row) => row.nummer.trim()));
      const added = [...new Set(found)]
        .filter((nummer) => !present.has(nummer))
        .map((nummer) => ({ ...newKassenzeichenRow(), nummer }));
      if (added.length) {
        tableProps.onChange([...tableProps.rows, ...added]);
        tableProps.onActiveChange(added[0].id);
      } else {
        message.info("Es wurden keine weiteren Kassenzeichen gefunden.");
      }
    } catch (error) {
      console.error("Kassenzeichen aus Flurstück", error);
      message.error(error.message);
    } finally {
      setSearching(false);
    }
  };
  const invalid = (record) =>
    invalidCell(record, "nummer") || duplicates.has(record.nummer.trim());
  useEffect(() => {
    const data = extractor(dataIn);
    setTransaction(data);
    setActiveRow(data[0]);
  }, [dataIn]);
  return (
    <div
      className="shadow-md bg-white overflow-auto"
      style={isStory ? storyStyle : { height: "100%", borderRadius: "6px" }}
    >
      <InfoBlock
        editable={editable}
        title={kassenzeichen.kassenzeichenTable.tableTitle}
        controlBar={
          editable ? (
            <Space size={4}>
              <Tooltip title="Kassenzeichen des Flurstücks hinzufügen">
                <Button
                  size="small"
                  icon={
                    <FontAwesomeIcon
                      icon={faWandMagicSparkles}
                      style={{ opacity: 0.75 }}
                    />
                  }
                  loading={searching}
                  disabled={!geometry}
                  onClick={addFromParcel}
                />
              </Tooltip>
              {actions}
            </Space>
          ) : (
            actions
          )
        }
      >
        <div className="relative">
          <SheetTable
            columns={kassenzeichenColumns({ invalid })}
            editable={editable}
            fixHeight
            view={{ rows: transaction, activeRow, setActiveRow }}
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

export default TransactionNumber;
TransactionNumber.propTypes = {
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
