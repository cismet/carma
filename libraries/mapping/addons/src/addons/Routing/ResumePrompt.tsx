import type { CSSProperties } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ROUTE_BLUE, getModeIcon } from "@carma-mapping/routing";

import { BottomCard } from "../RoutePreview/BottomCard";
import { DEFAULT_ROUTE_MODE } from "./routeModeChannel";
import type { SavedNavigation } from "./resumeStorage";

const RESUME_BUTTON_STYLE: CSSProperties = {
  backgroundColor: ROUTE_BLUE,
  color: "#ffffff",
};

type ResumePromptProps = {
  saved: SavedNavigation;
  onResume: () => void;
  onDiscard: () => void;
};

/**
 * After a reload, the navigation that was running: "Navigation fortsetzen?"
 * with the route's name, "Fortsetzen" and "Verwerfen". At the bottom like the
 * route preview, in the bottom-left column on a phone (`BottomCard`).
 *
 * Asked, not resumed on its own: the reload may have been the user leaving
 * on purpose, and a camera that tilts and turns by itself on page load is
 * the last thing they expect.
 */
export const ResumePrompt = ({
  saved,
  onResume,
  onDiscard,
}: ResumePromptProps) => (
  <BottomCard testId="routing-resume">
    <FontAwesomeIcon
      icon={getModeIcon(saved.route.mode ?? DEFAULT_ROUTE_MODE)}
      className="shrink-0 text-xl text-gray-600"
    />
    <div className="flex min-w-0 flex-1 flex-col leading-tight">
      <span className="truncate text-base font-medium">
        Navigation fortsetzen?
      </span>
      {saved.route.label && (
        <span className="truncate text-sm text-gray-600">
          {saved.route.label}
        </span>
      )}
    </div>
    <button
      type="button"
      className="h-8 shrink-0 cursor-pointer rounded-[8px] border-0 bg-transparent px-2 text-sm text-gray-600 hover:bg-black/5"
      onClick={onDiscard}
      data-test-id="routing-resume-discard"
    >
      Verwerfen
    </button>
    <button
      type="button"
      className="h-8 shrink-0 cursor-pointer rounded-[8px] border-0 px-3 text-sm font-medium"
      style={RESUME_BUTTON_STYLE}
      onClick={onResume}
      data-test-id="routing-resume-continue"
    >
      Fortsetzen
    </button>
  </BottomCard>
);
