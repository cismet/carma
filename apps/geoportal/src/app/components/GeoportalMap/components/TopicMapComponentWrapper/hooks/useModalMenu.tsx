import { useContext, useMemo, useState } from "react";
import { Button, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRightFromBracket,
  faKey,
} from "@fortawesome/free-solid-svg-icons";

import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";

import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/geoportal";
import LoginForm from "../../../../LoginForm";
import { useAuth } from "@carma-providers/auth";

export const useModalMenu = ({
  version,
  showOverlayFromOutside,
}: {
  version: string;
  showOverlayFromOutside: (key: string) => void;
}) => {
  const { jwt, setJWT } = useAuth();
  const { setAppMenuVisible } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);

  const [isLoginFormVisible, setIsLoginFormVisible] = useState(false);

  const modalMenu = useMemo(
    () => (
      <GenericModalApplicationMenu
        {...getCollabedHelpComponentConfig({
          versionString: version,
          showOverlayFromOutside,
          loginFormToggle: () => setIsLoginFormVisible(!isLoginFormVisible),
          isLoginFormVisible,
          loginForm: (
            <LoginForm
              onSuccess={() => {
                setIsLoginFormVisible(false);
                setAppMenuVisible(false);
              }}
              closeLoginForm={() => setIsLoginFormVisible(false)}
            />
          ),
          loginFormTrigger: (
            <Tooltip title={jwt ? "Abmeldung" : "Anmeldung"} zIndex={99999999}>
              <Button
                type="text"
                onClick={() =>
                  jwt
                    ? setJWT(null)
                    : setIsLoginFormVisible(!isLoginFormVisible)
                }
              >
                <FontAwesomeIcon
                  icon={jwt ? faArrowRightFromBracket : faKey}
                  size="lg"
                />
              </Button>
            </Tooltip>
          ),
        })}
      />
    ),
    [
      version,
      showOverlayFromOutside,
      isLoginFormVisible,
      jwt,
      setJWT,
      setAppMenuVisible,
    ]
  );

  return modalMenu;
};
