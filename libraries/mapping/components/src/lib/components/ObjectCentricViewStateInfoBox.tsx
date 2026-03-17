import {
  CarmaResponsiveInfoBox,
  type CarmaResponsiveInfoBoxProps,
} from "@carma-commons/ui/components";
import { InfoCircleOutlined } from "@ant-design/icons";
import { Button, Popover, Tooltip } from "antd";
import {
  ViewStateVisualizer,
  type ViewStateVisualizerProps,
  type ViewStateVisualizerCueOptions,
} from "./ViewStateVisualizer";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const CUE_GLYPH_COLUMN_WIDTH_PX = 14;
const CUE_DASH_COLUMN_WIDTH_PX = 14;

export type ObjectCentricViewStateInfoValueRow = {
  kind?: "value";
  key?: string;
  cueLabel?: ReactNode;
  cueColor?: string;
  label: string;
  value: ReactNode;
  tooltip?: ReactNode;
};

export type ObjectCentricViewStateInfoSectionRow = {
  kind: "section";
  key?: string;
  label: ReactNode;
};

export type ObjectCentricViewStateInfoRow =
  | ObjectCentricViewStateInfoValueRow
  | ObjectCentricViewStateInfoSectionRow;

export type ObjectCentricViewStateInfoBoxProps = {
  heading?: ReactNode;
  rows: readonly ObjectCentricViewStateInfoRow[];
  specification: ViewStateVisualizerProps["specification"];
  visualizerDisplayOptions?: ViewStateVisualizerProps["displayOptions"];
  visualizerCueOptions?: ViewStateVisualizerCueOptions;
  visualizerBearingLabel?: ViewStateVisualizerProps["bearingLabel"];
  visualizerPitchLabel?: ViewStateVisualizerProps["pitchLabel"];
  visualizerWidth?: number;
  visualizerHeight?: number;
  width?: number;
  bodyStyle?: CSSProperties;
  detailsTitle?: ReactNode;
  detailsContent?: ReactNode;
} & Pick<
  CarmaResponsiveInfoBoxProps,
  | "draggable"
  | "dragGripPlacement"
  | "dragHandleTitle"
  | "collapsible"
  | "useControlLayout"
  | "headingColor"
  | "style"
>;

export const ObjectCentricViewStateInfoBox = ({
  heading,
  rows,
  specification,
  visualizerDisplayOptions,
  visualizerCueOptions,
  visualizerBearingLabel = "b",
  visualizerPitchLabel = "p",
  visualizerWidth = 176,
  visualizerHeight = 176,
  width = 440,
  bodyStyle,
  detailsTitle,
  detailsContent,
  draggable = true,
  dragGripPlacement = "auto",
  dragHandleTitle = "Drag scene-state panel",
  collapsible = true,
  useControlLayout = false,
  headingColor = "rgba(51, 65, 85, 0.94)",
  style,
}: ObjectCentricViewStateInfoBoxProps) => {
  const visualizerSlotRef = useRef<HTMLDivElement | null>(null);
  const [measuredVisualizerWidth, setMeasuredVisualizerWidth] = useState(0);
  const fallbackVisualizerSize = Math.min(visualizerWidth, visualizerHeight);
  const resolvedVisualizerSize =
    measuredVisualizerWidth > 0
      ? Math.max(fallbackVisualizerSize, Math.floor(measuredVisualizerWidth))
      : fallbackVisualizerSize;

  useEffect(() => {
    const element = visualizerSlotRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateMeasuredWidth = () => {
      setMeasuredVisualizerWidth(element.clientWidth);
    };

    updateMeasuredWidth();
    const observer = new ResizeObserver(() => {
      updateMeasuredWidth();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <CarmaResponsiveInfoBox
      useControlLayout={useControlLayout}
      draggable={draggable}
      dragGripPlacement={dragGripPlacement}
      dragHandleTitle={dragHandleTitle}
      width={width}
      collapsible={collapsible}
      headingColor={headingColor}
      heading={heading}
      style={style}
      bodyStyle={{
        backgroundColor: "rgba(255, 255, 255, 0.8)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        ...bodyStyle,
      }}
      content={
        <div
          style={{
            display: "grid",
            gap: 8,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "max-content minmax(0, 1fr)",
              alignItems: "start",
              gap: 10,
              width: "100%",
            }}
          >
            <div
              style={{
                display: "grid",
                gap: 6,
                width: "fit-content",
              }}
            >
              <table
                style={{
                  width: "auto",
                  display: "inline-table",
                  borderCollapse: "collapse",
                  fontSize: 11,
                  color: "#1f2937",
                  fontVariantNumeric: "tabular-nums",
                  tableLayout: "auto",
                  alignSelf: "start",
                  margin: "4px 0 0",
                }}
              >
                <tbody>
                  {rows.map((row) =>
                    row.kind === "section" ? (
                      <tr key={row.key ?? String(row.label)}>
                        <td
                          style={{
                            width: CUE_GLYPH_COLUMN_WIDTH_PX,
                            minWidth: CUE_GLYPH_COLUMN_WIDTH_PX,
                            padding: "6px 2px 1px 8px",
                          }}
                        />
                        <td
                          style={{
                            width: CUE_DASH_COLUMN_WIDTH_PX,
                            minWidth: CUE_DASH_COLUMN_WIDTH_PX,
                            padding: "6px 8px 1px 0",
                          }}
                        />
                        <td
                          style={{
                            padding: "6px 8px 1px 0",
                            color: "#334155",
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                            lineHeight: 1.05,
                          }}
                        >
                          {row.label}
                        </td>
                      </tr>
                    ) : (
                      <tr key={row.key ?? row.label}>
                        <td
                          style={{
                            padding: "1px 2px 1px 8px",
                            color: row.cueColor ?? "#94a3b8",
                            whiteSpace: "nowrap",
                            width: CUE_GLYPH_COLUMN_WIDTH_PX,
                            minWidth: CUE_GLYPH_COLUMN_WIDTH_PX,
                            lineHeight: 1.15,
                            fontSize: 11,
                            textAlign: "left",
                          }}
                        >
                          {row.cueLabel ? (
                            <span
                              style={{
                                display: "inline-block",
                                fontWeight: 700,
                                lineHeight: 1.15,
                              }}
                            >
                              {row.cueLabel}
                            </span>
                          ) : null}
                        </td>
                        <td
                          style={{
                            padding: "1px 6px 1px 0",
                            color: row.cueColor ?? "#94a3b8",
                            whiteSpace: "nowrap",
                            width: CUE_DASH_COLUMN_WIDTH_PX,
                            minWidth: CUE_DASH_COLUMN_WIDTH_PX,
                            fontSize: 11,
                            fontWeight: 700,
                            textAlign: "left",
                            lineHeight: 1.15,
                          }}
                        >
                          {row.cueLabel ? "\u2013" : null}
                        </td>
                        <td
                          style={{
                            padding: "1px 8px 1px 0",
                            lineHeight: 1.15,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "baseline",
                              justifyContent: "space-between",
                              gap: 12,
                              minWidth: 0,
                            }}
                          >
                            <span
                              style={{
                                color: "#475569",
                                whiteSpace: "nowrap",
                                minWidth: 0,
                              }}
                            >
                              {row.label}
                              {row.tooltip ? (
                                <Tooltip title={row.tooltip}>
                                  <InfoCircleOutlined
                                    style={{
                                      marginLeft: 4,
                                      color: "#94a3b8",
                                      fontSize: 10,
                                      verticalAlign: "0.05em",
                                    }}
                                  />
                                </Tooltip>
                              ) : null}
                            </span>
                            <span
                              style={{
                                textAlign: "right",
                                whiteSpace: "nowrap",
                                flex: "0 0 auto",
                              }}
                            >
                              {row.value}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
            <div
              ref={visualizerSlotRef}
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                minWidth: 0,
                width: "100%",
              }}
            >
              <ViewStateVisualizer
                specification={specification}
                displayOptions={visualizerDisplayOptions}
                cueOptions={visualizerCueOptions}
                width={resolvedVisualizerSize}
                height={resolvedVisualizerSize}
                bearingLabel={visualizerBearingLabel}
                pitchLabel={visualizerPitchLabel}
              />
            </div>
          </div>
          {detailsContent ? (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-start",
                padding: "0 8px 4px",
              }}
            >
              <Popover
                trigger="click"
                placement="bottomLeft"
                title={detailsTitle ?? "Details"}
                content={
                  <div
                    style={{
                      maxWidth: 520,
                      maxHeight: 360,
                      overflow: "auto",
                    }}
                  >
                    {detailsContent}
                  </div>
                }
              >
                <Button
                  type="text"
                  size="small"
                  icon={<InfoCircleOutlined />}
                  style={{
                    paddingInline: 0,
                    color: "#475569",
                    fontSize: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {detailsTitle ?? "Details"}
                </Button>
              </Popover>
            </div>
          ) : null}
        </div>
      }
    />
  );
};

export default ObjectCentricViewStateInfoBox;
