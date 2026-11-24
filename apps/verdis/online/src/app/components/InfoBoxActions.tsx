import { useContext } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { UIContext } from "react-cismap/contexts/UIContextProvider";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import "./InfoBoxActions.css";

export interface InfoBoxAction {
  key: string;
  icon: IconDefinition;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}

interface InfoBoxActionsProps {
  actions: InfoBoxAction[];
}

const InfoBoxActions = ({ actions }: InfoBoxActionsProps) => {
  const { collapsedInfoBox } = (useContext(UIContext) || {}) as {
    collapsedInfoBox?: boolean;
  };
  if (collapsedInfoBox) return <div />;

  return (
    <div className="infobox-actions">
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          className="btn btn-light"
          title={action.title}
          aria-label={action.title}
          onClick={action.onClick}
          disabled={action.disabled}
        >
          <FontAwesomeIcon icon={action.icon} />
        </button>
      ))}
    </div>
  );
};

export default InfoBoxActions;
