# Stories Playground

Storybook-only playground for documenting and testing CARMA components without
creating circular dependencies.

## Why This Exists

- Prevents circular deps: sits above all libraries and can import from any
  package.
- Reusable: stories can document any library in the monorepo.
- Self-contained: stories can provide only the minimum runtime they need.
- Deployable: the static Storybook build can be hosted as documentation.

## Structure

Keep stories grouped by the monorepo library structure, not by ad-hoc story
themes.

Preferred grouping:

1. First level: parent library area from `libraries/`
   - examples: `common`, `mapping`, `providers`
2. Second level: the actual library name
   - examples: `ui`, `svg`, `annotations`, `view-sync`, `label-overlay`
3. Keep nesting shallow after that
   - prefer flat story files under the lib group
   - add extra folders only when they reflect real shared code, not just a story category

Examples:

```text
playgrounds/stories/src/stories/
  common/
    ui/
    svg/
  mapping/
    annotations/
    view-sync/
  providers/
    label-overlay/
```

## Story Rules

### Reuse First

- Prefer stories that reuse shared library components directly.
- Creating new story-only components or abstractions is a last resort.
- If a story needs custom UI, first check whether an existing component from
  `commons/ui`, `mapping/components`, `map-controls-layout`, `antd`, or `leva`
  already fits.
- If a small story-local helper is still needed, keep it minimal and scoped to
  composition, not to recreating library behavior.

### UI And Styling

- Prefer shared CARMA infobox/card/status bar components over custom story
  chrome.
- Prefer `antd` for story controls and compact UI affordances when shared CARMA
  components do not already cover the need.
- Prefer the standard Leva container where Leva is used; do not restyle it into
  a story-specific variant without a good reason.
- Prefer `ResponsiveStatusBar` for status readouts instead of custom status
  widgets.
- Keep stories fullscreen unless a smaller layout is specifically the point of
  the story.

### Cesium Stories

- Always use the CARMA CesiumWidget helper path from the Cesium API.
- Use `createMinimalCesiumWidget` or the shared Cesium story helpers.
- Do not create `Viewer` instances in stories.
- Do not use Cesium entities in stories; prefer primitives/helpers from CARMA
  Cesium libs.
- For Cesium scenes, prefer `requestRenderMode` and the shared terrain/tileset
  helpers already used by other stories.

## Usage

### Development

```sh
npx nx storybook stories
```

Default local port:

- Storybook: `http://localhost:4400`

### Deployment

```sh
npx nx build-storybook stories
```

Output:

- `dist/storybook/stories/`

## Adding Stories

1. Place the file under the correct parent lib grouping.
2. Reuse existing shared components before introducing story-only wrappers.
3. Use CSF3.
4. Add only the controls that help exercise the real library behavior.
5. Keep the story name short and the grouping informative.
