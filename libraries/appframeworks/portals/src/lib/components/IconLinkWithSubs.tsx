import IconLink from "react-cismap/commons/IconLink";
import { SubActionsDropUp, type SubAction } from "./SubActionsDropUp";

/**
 * Icon in the infobox title row that opens an upward menu of sub actions
 * instead of acting itself. InfoBox reads `subs` (with `iconname` and
 * `tooltip`) off this element when it turns the links into big action
 * buttons, and shows the same menu there.
 */
export const IconLinkWithSubs = ({
  tooltip,
  iconname,
  icon,
  subs,
}: {
  tooltip?: string;
  iconname?: string;
  icon?: JSX.Element;
  subs: SubAction[];
}) => (
  <SubActionsDropUp subs={subs} clearOfInfoBox>
    <IconLink tooltip={tooltip} iconname={iconname} icon={icon} />
  </SubActionsDropUp>
);
