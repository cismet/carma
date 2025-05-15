import { useDispatch, useSelector } from "react-redux";
import { getKassenzeichen } from "../../store/slices/kassenzeichen";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLockOpen } from "@fortawesome/free-solid-svg-icons";
import { panelTitles } from "@carma-collab/wuppertal/verdis-online";
import { fitAll } from "../../store/slices/mapping";
import type { UnknownAction } from "redux";

const KassenzeichenPanel = () => {
  const kassenzeichen = useSelector(getKassenzeichen);
  const dispatch = useDispatch();

  const styleOverride = {
    marginBottom: "5px",
    width: "100%",
  };
  return (
    <div
      className="gradient-bg-for-cards"
      onClick={() => dispatch(fitAll() as unknown as UnknownAction)}
      style={{
        ...styleOverride,
        minHeight: 20,
        backgroundColor: "#f5f5f5",
        border: "1px solid #e3e3e3",
        padding: 9,
        borderRadius: 3,
        height: "auto",
      }}
    >
      <h4>{panelTitles.kassenzeichenTitle}</h4>
      <small>erfasst am {kassenzeichen.datum_erfassung}</small>
      <table style={{ width: "100%" }}>
        <tbody>
          <tr>
            <td>
              <h2>{kassenzeichen.kassenzeichennummer8}</h2>
            </td>
            <td style={{ textAlign: "right", verticalAlign: "bottom" }}>
              <FontAwesomeIcon icon={faLockOpen} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default KassenzeichenPanel;
