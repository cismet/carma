import { Fragment, type CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/react";

import type { KeyboardDisplayPlatform } from "@carma-commons/ui/components";
import {
  ANNOTATION_INFO_BOX_HELP_ACTION_TRIGGER_ALIGNMENTS,
  ANNOTATION_INFO_BOX_HELP_LAYOUTS,
  AnnotationInfoBoxHelpContent,
  type AnnotationInfoBoxHelpActionTriggerAlignment,
  type AnnotationInfoBoxHelpItem,
  type AnnotationInfoBoxHelpLayout,
} from "@carma-mapping/annotations/ui";
import {
  distanceToolPlugin,
  pointToolPlugin,
  selectToolPlugin,
} from "@carma-mapping/annotations/builtin-tools";
import {
  resolveNodeEditHelpItems,
  type AnnotationToolDraftState,
} from "@carma-mapping/annotations/runtime";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";

// The info box shows German content (the geoportal help locale is fixed to
// German); the locale toggle only affects the localized key/pointer labels
// (Rücktaste vs Backspace, Klick vs Click). The selected-measurement readouts
// (metric grids) live in the "Geoportal/InfoBox Parity" story — this one covers
// the help / instruction states for the select, point and distance tools,
// including the node-edit "Bearbeitungsmodus" help. (cismet/wupp#4078)

type StatesStoryArgs = {
  locale: "de-DE" | "en-US";
  layout: AnnotationInfoBoxHelpLayout;
  platform: KeyboardDisplayPlatform;
};

const meta = {
  title: "Annotations/Measurement InfoBox States",
  parameters: {
    layout: "fullscreen",
    controls: { expanded: false },
  },
  args: {
    locale: "de-DE",
    layout: ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT,
    platform: "macos",
  },
  argTypes: {
    locale: { control: "radio", options: ["de-DE", "en-US"] },
    platform: { control: "radio", options: ["macos", "windows", "other"] },
    layout: {
      control: "radio",
      options: [
        ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT,
        ANNOTATION_INFO_BOX_HELP_LAYOUTS.STANDARD,
      ],
    },
  },
} satisfies Meta<StatesStoryArgs>;

export default meta;
type Story = StoryObj<StatesStoryArgs>;

const draftWithPoints = (count: number): AnnotationToolDraftState => ({
  coordinates: Array.from({ length: count }, () => ({
    longitude: 7,
    latitude: 51,
    altitude: 100,
  })),
  linkedNodeGroupIds: Array.from({ length: count }, () => null),
  feedback: null,
});

const { START } = ANNOTATION_INFO_BOX_HELP_ACTION_TRIGGER_ALIGNMENTS;

type StateEntry = {
  state: string;
  items: readonly AnnotationInfoBoxHelpItem[];
  actionTriggerAlign?: AnnotationInfoBoxHelpActionTriggerAlignment;
};

type ToolGroup = {
  tool: string;
  note?: string;
  states: readonly StateEntry[];
};

// All content is resolved from the real tool plugins and the runtime edit-help
// resolver, so the story stays in lockstep with production and guards against
// regressions.
const TOOL_GROUPS: readonly ToolGroup[] = [
  {
    tool: "Auswahl (Select)",
    note: "Ausgewählte Messungen zeigen ihre Werte — siehe „Geoportal/InfoBox Parity“.",
    states: [
      {
        state: "Nichts ausgewählt",
        items: selectToolPlugin.helpText ?? [],
      },
    ],
  },
  {
    tool: "Punktmessung (Point)",
    states: [
      {
        state: "Leerlauf",
        items: pointToolPlugin.helpText ?? [],
      },
      {
        state: "Bearbeitungsmodus (Punkt editieren)",
        items: resolveNodeEditHelpItems({ toolType: ANNOTATION_TYPES.POINT }),
        actionTriggerAlign: START,
      },
    ],
  },
  {
    tool: "Distanzmessung (Distance)",
    states: [
      {
        state: "Leerlauf",
        items: distanceToolPlugin.helpText ?? [],
      },
      {
        state: "Messung läuft (Startpunkt gesetzt)",
        items:
          distanceToolPlugin.resolveHelpText?.({
            draftState: draftWithPoints(1),
            pointQueryPickResult: null,
          }) ??
          distanceToolPlugin.helpText ??
          [],
      },
      {
        state: "Bearbeitungsmodus (Punkt editieren)",
        items: resolveNodeEditHelpItems({
          toolType: ANNOTATION_TYPES.DISTANCE,
        }),
        actionTriggerAlign: START,
      },
    ],
  },
];

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "#f3f4f6",
  color: "#111827",
  fontFamily:
    'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const pageTitleStyle: CSSProperties = {
  margin: "0 0 4px",
  fontSize: 18,
  fontWeight: 700,
};

const pageSubtitleStyle: CSSProperties = {
  margin: "0 0 20px",
  fontSize: 12,
  color: "#6b7280",
};

const toolHeadingStyle: CSSProperties = {
  margin: "20px 0 10px",
  padding: "8px 12px",
  borderRadius: 6,
  background: "#e5e7eb",
  fontSize: 13,
  fontWeight: 700,
};

const toolNoteStyle: CSSProperties = {
  margin: "-4px 0 12px",
  fontSize: 11,
  color: "#6b7280",
  fontStyle: "italic",
};

const cardRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  alignItems: "flex-start",
};

const cardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const cellLabelStyle: CSSProperties = {
  color: "#475569",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const infoBoxPreviewStyle: CSSProperties = {
  display: "inline-block",
  minWidth: 280,
  maxWidth: 380,
  padding: "14px 16px 8px",
  borderRadius: 6,
  background: "rgba(255, 255, 255, 0.92)",
  boxShadow: "0 1px 6px rgba(15, 23, 42, 0.2)",
  fontSize: 12,
  lineHeight: 1.35,
};

const emptyStateStyle: CSSProperties = {
  color: "#9ca3af",
  fontStyle: "italic",
};

const StatesStory = ({ locale, layout, platform }: StatesStoryArgs) => (
  <div style={pageStyle}>
    <h1 style={pageTitleStyle}>Mess-Infobox — Hilfe- und Bedienzustände</h1>
    <p style={pageSubtitleStyle}>
      Auswahl-, Punkt- und Distanzwerkzeug. Inhalte stammen direkt aus den
      Tool-Plugins und dem Editier-Hilfe-Resolver.
    </p>
    {TOOL_GROUPS.map((group) => (
      <Fragment key={group.tool}>
        <div style={toolHeadingStyle}>{group.tool}</div>
        {group.note ? <div style={toolNoteStyle}>{group.note}</div> : null}
        <div style={cardRowStyle}>
          {group.states.map((entry) => (
            <div key={entry.state} style={cardStyle}>
              <div style={cellLabelStyle}>{entry.state}</div>
              <div style={infoBoxPreviewStyle}>
                {entry.items.length > 0 ? (
                  <AnnotationInfoBoxHelpContent
                    items={entry.items}
                    layout={layout}
                    locale={locale}
                    platform={platform}
                    actionTriggerAlign={entry.actionTriggerAlign ?? START}
                  />
                ) : (
                  <span style={emptyStateStyle}>(kein Hilfetext)</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Fragment>
    ))}
  </div>
);

export const States: Story = {
  name: "InfoBox States",
  render: (args) => <StatesStory {...args} />,
};
