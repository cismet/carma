import { TooltipProps } from "antd";
interface ContactMailButtonProps {
  emailAddress: string;
  subjectPrefix: string;
  productName: string;
  portalName: string;
  width?: string;
  imageId?: string;
  imageUri?: string;
  tooltip?: TooltipProps;
}
export declare const ContactMailButton: ({
  emailAddress,
  subjectPrefix,
  productName,
  portalName,
  width,
  imageId,
  imageUri,
  tooltip,
}: ContactMailButtonProps) => import("react/jsx-runtime").JSX.Element;
export {};
