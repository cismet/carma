import Toggle from "react-bootstrap-toggle";
import { useDispatch, useSelector } from "react-redux";
import { getUiState, setCREditMode } from "../../../store/slices/ui";
import "./toggle.css";
import { AnderungswunscheIntroduction } from "@carma-collab/wuppertal/verdis-online";
import ExpandableHint from "./ExpandableHint";

const CR05Introduction = () => {
  const uiState = useSelector(getUiState);
  const dispatch = useDispatch();
  const foldTexts = uiState.width < 992;
  return (
    <>
      {foldTexts && uiState.changeRequestsEditMode ? (
        <ExpandableHint
          icon="ℹ"
          hint="Flächen ändern und Kontakt aufnehmen"
          details={<AnderungswunscheIntroduction />}
        />
      ) : (
        <AnderungswunscheIntroduction />
      )}
      <div style={{ textAlign: "center", marginTop: "20px" }}>
        <div style={{ fontSize: "20px" }}>
          <strong>Änderungsmodus: </strong>
          <Toggle
            onClick={() => {
              dispatch(setCREditMode(!uiState.changeRequestsEditMode));
            }}
            on={"Ein"}
            off={"Aus"}
            offstyle="danger"
            onstyle="success"
            active={uiState.changeRequestsEditMode}
            style={{ padding: 10 }}
          />
        </div>
      </div>
    </>
  );
};

export default CR05Introduction;
