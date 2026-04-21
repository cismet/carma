import type { CSSProperties, ReactNode } from "react";

import type {
  AnnotationInfoBoxSlots,
  AnnotationInfoBoxVisualOptions,
} from "../annotation-info-box.types";
import { resolveAnnotationInfoBoxVisualOptions } from "../config/annotation-info-box-visual-defaults";
import {
  AnnotationInfoBoxActions,
  type AnnotationInfoBoxActionsProps,
} from "./AnnotationInfoBoxActions";
import {
  AnnotationInfoBoxMetaText,
} from "./AnnotationInfoBoxMetaText";
import {
  AnnotationInfoBoxNavigation,
  type AnnotationInfoBoxNavigationProps,
} from "./AnnotationInfoBoxNavigation";
import {
  AnnotationInfoBoxTextContent,
} from "./AnnotationInfoBoxTextContent";
import {
  AnnotationInfoBoxTitleInput,
  type AnnotationInfoBoxTitleInputProps,
} from "./AnnotationInfoBoxTitleInput";

export type AnnotationMeasurementInfoBoxShellProps = {
  headingTitle: string;
  headingColor?: string;
  titleInput: AnnotationInfoBoxTitleInputProps;
  actions: AnnotationInfoBoxActionsProps;
  metaText?: ReactNode;
  content: ReactNode;
  contentVariant?: "text" | "raw";
  contentClassName?: string;
  contentStyle?: CSSProperties;
  navigation?: Omit<AnnotationInfoBoxNavigationProps, "visualOptions">;
  collapsible?: boolean;
  visualOptions?: Partial<AnnotationInfoBoxVisualOptions>;
};

export const buildAnnotationMeasurementInfoBoxSlots = ({
  headingTitle,
  headingColor,
  titleInput,
  actions,
  metaText,
  content,
  contentVariant = "text",
  contentClassName,
  contentStyle,
  navigation,
  collapsible = true,
  visualOptions,
}: AnnotationMeasurementInfoBoxShellProps): AnnotationInfoBoxSlots => {
  const resolvedVisualOptions =
    resolveAnnotationInfoBoxVisualOptions(visualOptions);

  const wrappedContent =
    contentVariant === "raw" ? (
      <div
        className={`${resolvedVisualOptions.bodyContainerClassName}${
          contentClassName ? ` ${contentClassName}` : ""
        }`}
        style={contentStyle}
      >
        {content}
      </div>
    ) : (
      <AnnotationInfoBoxTextContent
        className={contentClassName}
        style={contentStyle}
        visualOptions={resolvedVisualOptions}
      >
        {content}
      </AnnotationInfoBoxTextContent>
    );

  return {
    headingTitle,
    headingColor,
    subtitle: (
      <div className={resolvedVisualOptions.subtitleContainerClassName}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <AnnotationInfoBoxTitleInput
              {...titleInput}
              visualOptions={resolvedVisualOptions}
            />
          </div>
          <div className="shrink-0">
            <AnnotationInfoBoxActions
              {...actions}
              visualOptions={resolvedVisualOptions}
            />
          </div>
        </div>
        {metaText ? (
          <AnnotationInfoBoxMetaText visualOptions={resolvedVisualOptions}>
            {metaText}
          </AnnotationInfoBoxMetaText>
        ) : null}
      </div>
    ),
    content: wrappedContent,
    footer: navigation ? (
      <AnnotationInfoBoxNavigation
        {...navigation}
        visualOptions={resolvedVisualOptions}
      />
    ) : undefined,
    collapsible,
  };
};
