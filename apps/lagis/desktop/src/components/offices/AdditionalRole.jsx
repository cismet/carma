import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import InfoBlock from "../ui/Blocks/InfoBlock";
import SheetTable from "../editing/SheetTable";
import useDraftTable from "../editing/useDraftTable";
import useStammdatenList from "../editing/useStammdatenList";
import { additionalRoleColumns } from "./additionalRoleColumns";
import { additionalRollExtractor } from "../../core/extractors/officesPageExtractor";
import { newRolleRow } from "../../core/wizard/adminData";
import { verwaltung } from "@carma-collab/wuppertal/lagis-desktop";

const AdditionalRole = ({ dataIn, extractor = additionalRollExtractor }) => {
  const [rolls, setRolls] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const { editable, locked, actions, tableProps } = useDraftTable({
    section: "admin",
    field: "rollen",
    newRow: newRolleRow,
    minusOffset: 1,
  });
  const dienststellen = useStammdatenList("dienststellen", editable);
  const rolleArten = useStammdatenList("rolleArten", editable);

  useEffect(() => {
    const data = extractor(dataIn);
    setRolls(data);
    setActiveRow(data[0]);
  }, [dataIn]);

  return (
    <div
      style={{
        height: "100%",
        borderRadius: "6px",
        backgroundColor: "#ffffff",
        overflow: "auto",
      }}
      className="shadow-md overflow-auto"
    >
      <InfoBlock
        editable={editable}
        locked={locked}
        title={verwaltung.zusatzlicheRollen.tableTitle}
        controlBar={actions}
      >
        <div style={{ position: "relative", height: "200px" }}>
          <SheetTable
            columns={additionalRoleColumns({ dienststellen, rolleArten })}
            editable={editable}
            ready={Boolean(dienststellen && rolleArten)}
            fixHeight
            view={{ rows: rolls, activeRow, setActiveRow }}
            edit={tableProps}
          />
        </div>
      </InfoBlock>
    </div>
  );
};
export default AdditionalRole;
AdditionalRole.propTypes = {
  dataIn: PropTypes.object,
  extractor: PropTypes.func,
};
