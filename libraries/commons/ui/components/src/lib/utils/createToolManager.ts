import type { ReactNode } from "react";

export type ToolDescriptorI18n = {
  labelKey: string;
  tooltipKey: string;
  helpTextKeys?: string[];
};

export type ToolDescriptor<TToolId extends string, TContext> = {
  id: TToolId;
  order: number;
  icon: ReactNode;
  i18n: ToolDescriptorI18n;
  isVisible?: (context: TContext) => boolean;
  isEnabled?: (context: TContext) => boolean;
  createSecondaryOptions?: (context: TContext) => ReactNode;
};

export type ToolManager<TToolId extends string, TContext> = {
  listTools: (
    context: TContext,
    singleToolId?: TToolId
  ) => ToolDescriptor<TToolId, TContext>[];
  getTool: (
    toolId: TToolId,
    context: TContext
  ) => ToolDescriptor<TToolId, TContext> | undefined;
};

export const createToolManager = <TToolId extends string, TContext>(
  descriptors: readonly ToolDescriptor<TToolId, TContext>[]
): ToolManager<TToolId, TContext> => {
  const sortedDescriptors = [...descriptors].sort((a, b) => a.order - b.order);

  const listTools = (
    context: TContext,
    singleToolId?: TToolId
  ): ToolDescriptor<TToolId, TContext>[] => {
    const visibleDescriptors = sortedDescriptors.filter((descriptor) =>
      descriptor.isVisible ? descriptor.isVisible(context) : true
    );

    if (!singleToolId) {
      return visibleDescriptors;
    }

    const singleDescriptor = visibleDescriptors.find(
      (descriptor) => descriptor.id === singleToolId
    );
    return singleDescriptor ? [singleDescriptor] : [];
  };

  const getTool = (toolId: TToolId, context: TContext) =>
    listTools(context).find((descriptor) => descriptor.id === toolId);

  return {
    listTools,
    getTool,
  };
};
