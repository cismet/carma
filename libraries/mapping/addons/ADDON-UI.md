# Addon UI

Where an addon's UI is allowed to land in a carma map app, what each surface
looks like, and the code that puts it there. [`README.md`](./README.md) covers
the addon system itself (kinds, config, registry, state channels); this file
covers only what the user sees.

Read this instead of collecting screenshots. Every surface below exists in the
geoportal today and names the file it is implemented in.

## The four surfaces

```
┌──────────────────────────────────────────────────────────────────────────┐
│  app header                                    Karte | Luftbild |  ☰     │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌───┐        ┌────┐ ┌──────────────┐ ┌─────────────────────┐             │
│ │ + │        │ 🗺 │ │ 🟫 Ortho 2024│ │ 🕐 Starkregen T50 …│  ← 2. layer │
│ │ − │        └────┘ └──────────────┘ └─────────────────────┘     bar row │
│ ├───┤                                                                    │
│ │ ⌂ │       ┌──────────────────────────────────────────────┐             │
│ │ i │       │  ‹ 00h 45m ›   ▬▬▬▬▬▬●▬▬▬▬▬▬▬▬▬▬   ▶   ⌄     │ ← 3. inter│
│ │ 📏│       │  ─────────────────────────────────────────── │    action  │
│ │ 🕐│ ←1.   │  WIEDERGABE            DARSTELLUNG           │    view    │
│ │ 🧩│ control│  [1×][2×][4×]         Deckkraft ▬▬●▬  85%   │   (ribbon) │
│ └───┘ column└──────────────────────────────────────────────┘             │
│                                                                          │
│                          4. map overlays (compare panes, spyglass, …)    │
└──────────────────────────────────────────────────────────────────────────┘
```

| # | Surface           | What belongs there                                   | Mounted by                        |
| - | ----------------- | ---------------------------------------------------- | --------------------------------- |
| 1 | Control column    | one on/off switch per addon, nothing stateful         | `<Control>` inside the addon      |
| 2 | Layer bar row     | that the addon is running, its title, its live value  | the host app, from a `Layer`      |
| 3 | Interaction view  | the panel the row opens: settings, transport, tools   | the host's `INTERACTION_COMPONENTS` |
| 4 | Map overlays      | anything that draws over or instead of the map        | the addon, freely                 |

An addon uses as few of them as it can. `libreTerrain` is surface 1 alone.
`timeSlider` uses 1, 2 and 3. `comparing` uses all four.

### 1. Control column

A square button in the map's control column. Its only job is on and off; it
carries no value and opens no menu.

```tsx
<Control position="topleft" order={85}>
  <Tooltip title={isOn ? "… ausschalten" : "… einschalten"} placement="right">
    <ControlButtonStyler onClick={toggle} dataTestId="time-slider-control">
      <FontAwesomeIcon icon={faClock} style={isOn ? { color: "#1677ff" } : undefined} />
    </ControlButtonStyler>
  </Tooltip>
</Control>
```

`Control` registers its children with the layout rather than rendering them in
place, so the addon does not have to know where the column is. Order values are
first come, first served; the geoportal's are:

| Order | Button                       |
| ----- | ---------------------------- |
| 60    | measurement                  |
| 70    | highlighting (`Auswahl`)     |
| 75    | comparison (`Vergleich`)     |
| 80    | terrain                      |
| 85    | time series (`Zeitreihe`)    |
| 90    | addon manager (puzzle piece) |

**Colour says one thing, and it is not "running".** An addon that also brings a
layer bar row already announces itself there, so the blue (`#1677ff`) is spent
on whether the row's panel is open; black otherwise. An addon with no row (the
terrain toggle) has nothing else to say it is on, so there blue does mean on.
Pick one of the two and keep the row's icon and this button on the same rule.

Tooltip on the right, and it says what the click will do, not what the state is.

**`Control` re-registers its children on every render**, so a component rendered
inside one must not hold local `useState` it wants to survive a pan. Put that
state in an addon-state channel.

### 2. Layer bar row

The pill in the horizontal bar over the map, next to the layers. It exists
exactly while the addon is running, and its ✕ ends the addon rather than hiding
a layer.

```
┌──────────────────────────────────────────────┐
│ 🕐  Starkregen T50 │ 00h 45m   ▶   ✕         │
└──┬────┬───────────┬─────────┬───┬────────────┘
   │    │           │         │   └─ remove, drawn by the host
   │    │           │         └───── action button (play/pause)
   │    │           └─────────────── live readout, opens the ribbon
   │    └─────────────────────────── title, opens the ribbon
   └──────────────────────────────── icon from `iconMap`
```

The addon describes the row as a `Layer` and hands it to the app; the app owns
the list it goes into.

```ts
export const TIME_SLIDER_LAYER: Layer = {
  id: "__timeSlider__",          // double underscore: not a real map layer
  title: "Zeitreihe",            // overwritten from the addon's state
  type: "object",
  icon: "timeSeries",            // key in libraries/mapping/components/.../iconMapping.ts
  iconColor: "#000000",          // blue only while the ribbon is open, see below
  visible: true,
  pinned: "last",                // synthetic rows sit at the end of the bar
  skipSelection: true,           // clicking it must not open a feature info view
  rowClickInteractionId: TIME_SLIDER_TOOLS_INTERACTION_ID,
};
```

| Field                   | Why it is set that way                                        |
| ----------------------- | -------------------------------------------------------------- |
| `id`                    | `__name__`, so it can never collide with a service's layer id  |
| `icon`                  | a key in the shared `iconMap`; add one there rather than an url |
| `pinned: "last"`        | keeps the tool rows behind the map content                      |
| `skipSelection: true`   | the row is a tool, so it has no feature info                    |
| `rowClickInteractionId` | which panel a click on the title opens                          |
| `iconColor`             | black; blue only while the row's panel is open                   |
| `interactionButtons`    | the readout and the actions, left of the ✕                      |

`interactionButtons[].icon` is a `ReactNode`, not an icon name, so a live
readout is just a `<span>`:

```tsx
{
  id: TIME_SLIDER_TOOLS_INTERACTION_ID, // same id as rowClickInteractionId, so
  icon: <span className="tabular-nums">{label}</span>, // it lights up with the
  tooltip: "Zeitreihe einstellen",                     // panel and closes it
}
```

A button with `onClick` acts at once and opens nothing; a button without one
toggles the panel registered under its `id`.

**Keeping the row alive is a hook, in two halves.** The library half says when
the row should exist and what is in it; the app half does the dispatching, since
libraries must not import redux:

```ts
// library: src/addons/TimeSlider/timeslider-layer-row.tsx
useTimeSliderLayerRow({ hasRow, onAdd, onRemove, onUpdate });

// app: apps/geoportal/src/app/hooks/useTimeSliderLayerButton.tsx
useTimeSliderLayerRow({
  hasRow: layers.some((layer) => layer.id === TIME_SLIDER_LAYER_ID),
  panelOpen: activeInteractionLayerID === TIME_SLIDER_LAYER_ID &&
             activeInteractionButtonID === TIME_SLIDER_TOOLS_INTERACTION_ID,
  onAdd: (layer) => { dispatch(appendLayer(layer)); /* and open the panel */ },
  onUpdate: (layer) => dispatch(updateLayer(layer)),
  onRemove: (id) => { dispatch(removeLayer(id)); /* and close the panel */ },
});
```

The app hook is called once in `LayerWrapper`. Four rules the library half has
to keep, all three existing rows get them wrong-proof the same way:

- the row's ✕ has to switch the addon off (`isOn && !hasRow && wasRow`), because
  the user closing the pill means "stop", not "hide"
- a row without a running addon is stale and gets removed, since the addon state
  is session-only while the layer list may be restored from storage
- the host keeps a **snapshot** of the `Layer`, so a changed readout must be
  handed over again through `onUpdate`
- guard against asking twice before the host's state catches up (`requestedRef`)

Whether the panel is open is the **app's** fact, not the library's, so it is
passed in and mirrored into the channel from there. That is what lets the
control-column button, which is nowhere near the layer bar, colour itself by it.

### 3. Interaction view (the ribbon)

The panel under the layer bar, opened from the row. This is where everything
adjustable lives.

```
┌────────────────────────────────────────────────────────────────────────┐
│ ‹  00h 45m  ›   ▬▬▬▬▬▬▬●▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬   ▶   ⌄              │  header row
├────────────────────────────────────────────────────────────────────────┤  (always)
│ Zeitschritte geladen: 18 von 24                    ↺ Zurücksetzen      │  status line
│                                                                        │
│ WIEDERGABE                        DARSTELLUNG                          │  section grid
│ [ 1× ][ 2× ][ 4× ]                Deckkraft ▬▬▬▬●▬▬  85%               │  (expanded)
└────────────────────────────────────────────────────────────────────────┘
```

**Collapsed is the default and is a complete UI on its own.** A preconfigured
addon ships collapsed and never has to grow: the header row carries the thing
the user came for. The chevron and everything under it is for the settings that
would otherwise need a dialog. Do not put anything in the expanded pane that the
addon cannot run without.

Header row, left to right: the value with its steppers, the primary control
stretching to fill, the transport, then the chevron. Nothing else.

**No title and no icon in the header.** The row the ribbon hangs off is directly
above it and already says which addon this is; repeating that costs the width
the primary control wants. A second row of buttons in the header means the addon
is doing two jobs and wants two rows in the layer bar.

Expanded pane: a status line with a reset on the right, then a two-column grid
of sections with uppercase headings. Sections are named after what the user is
changing (`Wiedergabe`, `Darstellung`, `Datum`, `Uhrzeit`), never after the
implementation.

The panel component takes no props worth having: it reads the addon-state
channel, the same one the row reads.

```tsx
// library
export const TimeSliderInteractionPanel = () => <TimeSliderPanel />;

// src/lib/interaction-components.ts, merged into the host's own map
export const ADDON_INTERACTION_COMPONENTS = {
  [TIME_SLIDER_TOOLS_INTERACTION_ID]: TimeSliderInteractionPanel,
};
```

Unlike surface 1, the interaction view keeps the component mounted across pans,
so purely visual state (whether the pane is expanded) may be local `useState`.
Anything the row or the map layer also needs goes in the channel.

### 4. Map overlays

Full-bleed UI: the comparison's panes, the spyglass, a legend. No shared rules
beyond not colliding with the three surfaces above; see
`src/addons/comparing/stage/`.

## Visual tokens

Copy these rather than inventing neighbours for them.

| Thing                | Value                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| accent (panel open)  | `#1677ff`; the resting colour of an icon is black                               |
| panel card           | `bg-white rounded-[10px] shadow-lg px-4 py-2`                                   |
| panel width          | `w-[100vw] sm:w-[86vw] sm:max-w-[680px] md:max-w-[760px]`                       |
| body text            | `text-sm text-gray-700`                                                        |
| section heading      | `text-xs font-medium uppercase tracking-wide text-gray-500`                     |
| numbers              | `tabular-nums`, always, so a value does not jitter while it counts             |
| icon button          | `h-8 w-8 rounded-full hover:bg-black/5`, icon only, `aria-label` mandatory     |
| segmented control    | `inline-flex rounded-lg bg-gray-100 p-1 gap-1`, active child `bg-white shadow-sm` |
| divider (horizontal) | `h-7 w-px bg-gray-200`                                                          |
| row separator        | `border-t border-solid border-gray-200 pt-2`                                    |

Wording: German, sentence case, and a tooltip says what the click does
(`Animation anhalten`), not what the state is (`Animation läuft`). Units go in
the readout, not in the label.

## Where the state goes

| Lives in                    | When                                                                |
| --------------------------- | ------------------------------------------------------------------- |
| local `useState`            | only the panel cares, and only while it is open (expanded, hover)   |
| addon-state channel         | two or more of the four surfaces read it                            |
| `localStorage` via the channel | it should survive a reload, as the comparison's layout does      |
| the app's redux store       | never from a library; the app dispatches, the library calls back    |

The time slider is the worked example: `isOn`, the position, the labels, the
play state, the speed and the opacity all sit in the `timeSeries` channel,
because the control button, the row, the ribbon and the map layer are four
components in three different subtrees, and each of them reads or writes at
least two of those fields.

## Checklist for a new addon UI

1. Can it be one control-column button? Then stop there.
2. Does the user need to see that it is running, or a live value? Add the layer
   bar row, with the two-half hook.
3. Does it have settings? Add the ribbon, collapsed, with the header row
   carrying the primary control.
4. Put the shared state in a channel and declare it in `AddonStateMap` plus the
   registry entry's `provides`.
5. Add the row's icon to `libraries/mapping/components/src/lib/components/iconMapping.ts`.
6. Register the panel in `src/lib/interaction-components.ts`.
7. Call the app-side row hook once, in the host's `LayerWrapper`.
8. `npx tsc --noEmit -p libraries/mapping/addons/tsconfig.lib.json` and the same
   for the host app.

## Reference implementations

| Addon           | Surfaces | Files                                                        |
| --------------- | -------- | ------------------------------------------------------------ |
| `timeSlider`    | 1, 2, 3  | `src/addons/TimeSlider/` (canonical; smallest complete set)  |
| `comparing`     | 1-4      | `src/addons/comparing/`                                      |
| `vectorHighlight` | 1-3    | `src/addons/VectorHighlight/`                                |
| `libreTerrain`  | 1        | `src/addons/LibreTerrain.tsx`                                |
