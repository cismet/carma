import { useDatasheet } from "@carma-mapping/engines/maplibre";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMap } from "@fortawesome/free-solid-svg-icons";

const NoFeatureSelected = () => {
  const { closeDatasheet } = useDatasheet();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "#999",
        fontSize: 14,
        gap: 8,
      }}
    >
      <span style={{ fontWeight: 600, fontSize: 16 }}>
        Kein Objekt selektiert.
      </span>
      <span>
        Bitte selektieren Sie ein Objekt zur Anzeige im Datenblatt.
      </span>
      <span>
        Um zur Kartenansicht zurückzukehren klicken Sie{" "}
        <button
          onClick={closeDatasheet}
          title="Zur Karte"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "none",
            background: "rgba(0,0,0,0.5)",
            color: "#fff",
            fontSize: 14,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
            verticalAlign: "middle",
          }}
        >
          <FontAwesomeIcon icon={faMap} />
        </button>
      </span>
    </div>
  );
};

export default NoFeatureSelected;
