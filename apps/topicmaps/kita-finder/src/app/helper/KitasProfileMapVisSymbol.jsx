import Icon from "react-cismap/commons/Icon";
import { getColorForProperties } from "./styler";
import { constants as kitasConstants } from "./constants";
import { useSelector } from "react-redux";
import { getFeatureRenderingOption } from "../store/slices/ui";

const KitasProfileMapVisSymbol = ({ inklusion, visible = true }) => {
  const renderingOption = useSelector(getFeatureRenderingOption);

  if (visible) {
    return (
      <Icon
        style={{
          color: getColorForProperties(
            { plaetze_fuer_behinderte: inklusion },
            renderingOption,
          ),
          width: "30px",
          textAlign: "center",
        }}
        name={"circle"}
      />
    );
  } else {
    return null;
  }
};

export default KitasProfileMapVisSymbol;
