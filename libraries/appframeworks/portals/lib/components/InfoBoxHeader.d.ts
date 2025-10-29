import { FeatureInfoProperties } from "../../../../../types/src/index.ts";
interface InfoBoxProps {
  headerColor?: string;
  content: string;
  properties?: FeatureInfoProperties;
}
export declare const InfoBoxHeader: ({
  headerColor,
  content,
  properties,
}: InfoBoxProps) => import("react/jsx-runtime").JSX.Element;
export {};
