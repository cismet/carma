import { VersionData } from "../../../../../commons/utils/src/index.ts";
interface InfoboxProps {
  selectedFeature: any;
  versionData: VersionData;
  bigMobileIconsInsteadOfCollapsing?: boolean;
  Modal?: React.ComponentType<any> | null;
}
export declare const FeatureInfobox: ({
  selectedFeature,
  versionData,
  bigMobileIconsInsteadOfCollapsing,
  Modal,
}: InfoboxProps) => import("react/jsx-runtime").JSX.Element | null;
export {};
