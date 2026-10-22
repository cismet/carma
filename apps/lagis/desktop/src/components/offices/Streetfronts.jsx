import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import InfoBlock from "../ui/Blocks/InfoBlock";
import SheetTable from "../editing/SheetTable";
import useDraftTable from "../editing/useDraftTable";
import useStammdatenList from "../editing/useStammdatenList";
import { streetfrontColumns } from "./streetfrontColumns";
import "./offices.css";
import { streetfrontsExtractor } from "../../core/extractors/officesPageExtractor";
import { newStrassenfrontRow } from "../../core/wizard/adminData";
import { verwaltung } from "@carma-collab/wuppertal/lagis-desktop";

const Streetfronts = ({ dataIn, extractor = streetfrontsExtractor }) => {
  const [streetfronts, setStreetfronts] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const { editable, actions, tableProps } = useDraftTable({
    section: "admin",
    field: "strassenfronten",
    newRow: newStrassenfrontRow,
    minusOffset: 1,
  });
  const strassennamen = useStammdatenList("strassennamen", editable);

  useEffect(() => {
    const data = extractor(dataIn);
    setStreetfronts(data);
    setActiveRow(data[0]);
  }, [dataIn]);

  return (
    <div
      className="shadow-md"
      style={{
        height: "100%",
        borderRadius: "6px",
        backgroundColor: "#ffffff",
        overflow: "auto",
      }}
    >
      <InfoBlock
        editable={editable}
        title={verwaltung.strassen.tableTitle}
        controlBar={actions}
      >
        <div className="relative">
          <SheetTable
            columns={streetfrontColumns({ strassennamen })}
            editable={editable}
            ready={Boolean(strassennamen)}
            fixHeight
            view={{ rows: streetfronts, activeRow, setActiveRow }}
            edit={tableProps}
          />
        </div>
      </InfoBlock>
    </div>
  );
};
export default Streetfronts;
Streetfronts.propTypes = {
  dataIn: PropTypes.object,
  extractor: PropTypes.func,
};
