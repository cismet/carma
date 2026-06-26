import { type MouseEvent, type ReactNode, useState } from "react";

import { faLock, faLockOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useCesiumRuntime } from "../../hooks/useCesiumRuntime";
import { lockPosition, unlockPosition } from "./lockCenterControl.utils";
import OnMapButton from "./OnMapButton";
type LockCenterControlProps = {
  children?: ReactNode;
};

const LockCenterControl = (props: LockCenterControlProps) => {
  const runtime = useCesiumRuntime();
  const [lockCenter, setLockCenter] = useState(false);

  const handleLockCenter = (e: MouseEvent) => {
    e.preventDefault();
    console.info("TODO: lockCenter functionality not implemented");
    if (lockCenter === false) {
      setLockCenter(true);
      runtime && lockPosition(runtime);
    } else {
      runtime && unlockPosition(runtime);
      setLockCenter(false);
    }
  };

  return (
    <OnMapButton
      title="Sperren/Entsprerren um den Mittelpunkt"
      onClick={handleLockCenter}
    >
      <FontAwesomeIcon
        icon={lockCenter ? faLock : faLockOpen}
      ></FontAwesomeIcon>
    </OnMapButton>
  );
};

export default LockCenterControl;
