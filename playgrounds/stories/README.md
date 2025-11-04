# Stories Playground

**Purpose:** Generic Storybook playground for documenting and testing CARMA components without circular dependencies.

## Why This Exists

- **Prevents circular deps config issues** - sits above all libraries, can import from any package
- **Reusable** - add stories for any component across the monorepo
- **Self-contained** - minimal providers for isolated testing (so transitions without pure Cesium/Leaflet deps)


## Usage

### Run Storybook
```
npx nx storybook stories
```

### Build Storybook
```
npx nx build-storybook stories
```

### Run Interactive App (optional)
npx nx serve stories


**Document usage:**
   - Add JSDoc comments to story
   - Use Storybook controls for interactive props
   - Include multiple scenarios (success, error, loading, etc.)

## Examples

### Map Framework Switcher Stories
- **MapFrameworkSwitcher.stories.tsx** - Basic 2D↔3D toggle button
