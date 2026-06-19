import type { ReactNode } from "react";

import type { AnnotationInfoBoxVisualOptions } from "../annotation-info-box.types";
import { resolveAnnotationInfoBoxVisualOptions } from "../config/annotation-info-box-visual-defaults";

export type AnnotationInfoBoxMetricGridItem = Readonly<{
  id?: string;
  label: ReactNode;
  value: ReactNode;
}>;

type AnnotationInfoBoxMetricGridProps = {
  items: readonly AnnotationInfoBoxMetricGridItem[];
  className?: string;
  visualOptions?: Partial<AnnotationInfoBoxVisualOptions>;
};

export const AnnotationInfoBoxMetricGrid = ({
  items,
  className,
  visualOptions,
}: AnnotationInfoBoxMetricGridProps) => {
  const resolvedVisualOptions =
    resolveAnnotationInfoBoxVisualOptions(visualOptions);
  const metricLabelTypographyClassName =
    resolvedVisualOptions.subtitleTextClassName
      .split(/\s+/)
      .filter((token) => token.length > 0 && !token.startsWith("px-"))
      .join(" ");

  return (
    <dl
      className={`m-0 flex flex-wrap items-start tabular-nums${
        className ? ` ${className}` : ""
      }`}
      style={{
        columnGap: "1.35rem",
        rowGap: "0.5rem",
      }}
    >
      {items.map((item, index) => (
        <div
          key={item.id ?? index}
          className="grid max-w-full min-w-[5rem] flex-[0_1_auto] grid-rows-[auto,auto] content-start items-start gap-y-[0.1em] text-left"
        >
          <dt
            className={metricLabelTypographyClassName}
            style={resolvedVisualOptions.subtitleTextStyle}
          >
            {item.label}
          </dt>
          <dd className="m-0 leading-[1.25]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
};
