import PropTypes from "prop-types";
import { Switch, Tooltip } from "antd";
import InfoBlock from "../ui/Blocks/InfoBlock";
import SheetTable from "../editing/SheetTable";
import useDraftTable from "../editing/useDraftTable";
import useStammdatenList from "../editing/useStammdatenList";
import useInvalidCells from "../editing/useInvalidCells";
import { USAGE_RULES } from "../../core/editing/validation";
import { isBuchwert } from "../../core/editing/usage";
import { useState, useEffect } from "react";
import { newUsageRow } from "../../core/wizard/usageData";
import { useSelector } from "react-redux";
import { getEditActive, getOriginalSection } from "../../store/slices/editing";
import useNkfAdmin from "./useNkfAdmin";
import RemoveUsageDialog from "./RemoveUsageDialog";
import UsageHistory, { UsageHistoryTime } from "./UsageHistory";
import { usageHistoryDays } from "../../core/extractors/usageHistory";
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
  const [pendingRemoval, setPendingRemoval] = useState();
  const [moment, setMoment] = useState();
  const nkfAdmin = useNkfAdmin();
  const isEdit = useSelector(getEditActive);
  const historic = Boolean(dataIn?.flurstueck_schluessel?.gueltig_bis);
  const { editable, locked, draft, patch, actions, tableProps } = useDraftTable(
    {
      section: "usage",
      field: "nutzungen",
      readOnly: historic,
      newRow: () => newUsageRow(),
      onRemove: (row, deleteRow) =>
        nkfAdmin && row?.nutzungId
          ? setPendingRemoval({ row, deleteRow })
          : deleteRow(),
    }
  );
  const closeRemoval = (withoutHistory) => {
    pendingRemoval.deleteRow();
    if (withoutHistory) {
      patch({
        withoutHistory: [
          ...(draft.withoutHistory ?? []),
          pendingRemoval.row.nutzungId,
        ],
      });
    }
    setPendingRemoval(undefined);
  };
  const stammdaten = useStammdatenList("nutzung", editable);
  const originalUsage = useSelector(getOriginalSection("usage"));
  const invalid = useInvalidCells("usage", tableProps.rows, USAGE_RULES);
  const originalById = new Map(
    (originalUsage?.nutzungen ?? []).map((row) => [row.id, row])
  );
  useEffect(() => {
    setMoment(undefined);
  }, [dataIn]);
  const shownMoment = editable ? undefined : moment;
  const historyDays = usageHistoryDays(dataIn);
  useEffect(() => {
    // same order as the edit rows (loadUsageSection)
    const data = [...extractor(dataIn, shownMoment)].sort(
      (a, b) => a.nutzung - b.nutzung || a.buchungs - b.buchungs
    );
    setUsage(data);
    setActiveRow(data[0]);
  }, [dataIn, shownMoment]);
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
        locked={locked}
        title={
          shownMoment ? (
            <span className="flex items-center gap-3">
              Nutzungshistorie
              <UsageHistoryTime
                days={historyDays}
                moment={moment}
                onChange={setMoment}
              />
            </span>
          ) : (
            nutzung.nutzungTable.tableTitle
          )
        }
        controlBar={actions}
        extraActions={
          editable ? (
            nkfAdmin && (
              <Tooltip title="Änderungen korrigieren die aktuelle Buchung, statt eine neue anzulegen. Die alten Werte gehen dabei verloren.">
                <span className="flex items-center gap-2 text-sm">
                  <Switch
                    size="small"
                    checked={Boolean(draft?.correct)}
                    onChange={(correct) => patch({ correct })}
                  />
                  ohne Historie
                </span>
              </Tooltip>
            )
          ) : (
            <span className="flex items-center gap-3">
              {isEdit && historic && (
                <span className="text-sm text-gray-500">
                  Historisches Flurstück, nicht bearbeitbar
                </span>
              )}
              <UsageHistory
                days={historyDays}
                moment={moment}
                onChange={setMoment}
              />
            </span>
          )
        }
      >
        <div className="relative flex-1 min-h-0 overflow-auto">
          <SheetTable
            columns={nutzungColumns({
              stammdaten,
              originalById,
              invalid,
              correct: Boolean(draft?.correct),
            })}
            editable={editable}
            ready={Boolean(stammdaten)}
            fixHeight
            scroll={NUTZUNG_SCROLL}
            className="nfk-cover"
            rowClassName={(row) =>
              (
                editable
                  ? !isBuchwert(originalById.get(row.id), row)
                  : row.buchwert === false
              )
                ? "nfk-not-buchwert"
                : ""
            }
            view={{ rows: usage, activeRow, setActiveRow }}
            edit={tableProps}
            toEditRow={(row) =>
              tableProps.rows.find((draftRow) => draftRow.id === String(row.id))
            }
          />
        </div>
      </InfoBlock>
      <RemoveUsageDialog
        open={Boolean(pendingRemoval)}
        onCancel={() => setPendingRemoval(undefined)}
        onWithoutHistory={() => closeRemoval(true)}
        onHistory={() => closeRemoval(false)}
      />
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
