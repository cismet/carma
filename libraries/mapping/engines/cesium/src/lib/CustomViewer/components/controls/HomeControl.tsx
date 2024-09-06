import { ReactNode, MouseEvent } from "react";
import { faHouseUser } from "@fortawesome/free-solid-svg-icons";

import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useHomeControl } from "../../hooks";

type HomeProps = {
  children?: ReactNode;
};

export const HomeControl = ({children}: HomeProps) => {
  const handleHomeClick = useHomeControl();

  return (
    <ControlButtonStyler
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        handleHomeClick();
      }}
      title="Startposition"
    >
      <FontAwesomeIcon icon={faHouseUser} />
      {children}
    </ControlButtonStyler>
  );
};

export default HomeControl;
