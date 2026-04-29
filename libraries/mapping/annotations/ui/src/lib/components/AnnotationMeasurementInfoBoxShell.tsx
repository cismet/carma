import {
  Fragment,
  isValidElement,
  type CSSProperties,
  type ReactNode,
} from "react";

import type {
  AnnotationInfoBoxSlots,
  AnnotationInfoBoxVisualOptions,
} from "../annotation-info-box.types";
import { resolveAnnotationInfoBoxVisualOptions } from "../config/annotation-info-box-visual-defaults";
import {
  AnnotationInfoBoxActions,
  type AnnotationInfoBoxActionsProps,
} from "./AnnotationInfoBoxActions";
import { AnnotationInfoBoxMetaText } from "./AnnotationInfoBoxMetaText";
import {
  AnnotationInfoBoxNavigation,
  type AnnotationInfoBoxNavigationProps,
} from "./AnnotationInfoBoxNavigation";
import { AnnotationInfoBoxTextContent } from "./AnnotationInfoBoxTextContent";
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
  content?: ReactNode;
  contentVariant?: "text" | "raw";
  contentClassName?: string;
  contentStyle?: CSSProperties;
  navigation?: Omit<AnnotationInfoBoxNavigationProps, "visualOptions">;
  collapsible?: boolean;
  visualOptions?: Partial<AnnotationInfoBoxVisualOptions>;
};

const hasRenderableContent = (node: ReactNode): boolean => {
  if (node === null || node === undefined || typeof node === "boolean") {
    return false;
  }

  if (typeof node === "string") {
    return node.trim().length > 0;
  }

  if (typeof node === "number") {
    return true;
  }

  if (Array.isArray(node)) {
    return node.some(hasRenderableContent);
  }

  if (isValidElement(node) && node.type === Fragment) {
    return hasRenderableContent(
      (node.props as { children?: ReactNode }).children
    );
  }

  return true;
};

const renderEmptyContentLine = (
  visualOptions: AnnotationInfoBoxVisualOptions
) => (
  <div
    aria-hidden="true"
    data-test-id="annotation-info-box-empty-content-line"
    className={visualOptions.emptyContentLineClassName}
    style={visualOptions.emptyContentLineStyle}
  />
);

const wrapInfoBoxContent = ({
  content,
  contentVariant,
  contentClassName,
  contentStyle,
  visualOptions,
}: {
  content: ReactNode;
  contentVariant: AnnotationMeasurementInfoBoxShellProps["contentVariant"];
  contentClassName?: string;
  contentStyle?: CSSProperties;
  visualOptions: AnnotationInfoBoxVisualOptions;
}) =>
  contentVariant === "raw" ? (
    <div
      className={`${visualOptions.bodyContainerClassName}${
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
      visualOptions={visualOptions}
    >
      {content}
    </AnnotationInfoBoxTextContent>
  );

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
  const contentIsRenderable = hasRenderableContent(content);
  const staticEmptyContentLine = contentIsRenderable ? null : (
    <AnnotationInfoBoxTextContent visualOptions={resolvedVisualOptions}>
      {renderEmptyContentLine(resolvedVisualOptions)}
    </AnnotationInfoBoxTextContent>
  );

  const wrappedContent = contentIsRenderable
    ? wrapInfoBoxContent({
        content,
        contentVariant,
        contentClassName,
        contentStyle,
        visualOptions: resolvedVisualOptions,
      })
    : undefined;

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
        {metaText && resolvedVisualOptions.showSubtitleMetaText ? (
          <AnnotationInfoBoxMetaText visualOptions={resolvedVisualOptions}>
            {metaText}
          </AnnotationInfoBoxMetaText>
        ) : null}
        {staticEmptyContentLine}
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
