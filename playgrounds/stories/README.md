# Stories Playground

**Storybook-only playground** for documenting and testing CARMA components without circular dependencies.

## Why This Exists

- **Prevents circular deps** - Sits above all libraries, can import from any package
- **Reusable** - Add stories for any component across the monorepo
- **Self-contained** - Minimal providers for isolated component testing
- **Deployable** - Build static Storybook site for documentation hosting

## Structure

```
playgrounds/stories/
  .storybook/          # Storybook configuration
    main.ts            # Stories pattern, addons, vite config reference
    preview.ts         # Global decorators, parameters
  stories/             # All story files in sub-folders by feature/project etc
    map-framework-switcher/
      LeafletCesium.stories.tsx
      ...
```

## Usage

### Development

```sh
# Start Storybook dev server (port 4400)
npx nx storybook stories
```

### Deployment

```sh
# Build static Storybook site
npx nx build-storybook stories

# Output: dist/storybook/stories/
# Deploy to any static hosting (Netlify, Vercel, GitHub Pages)
```

## Adding Stories

1. Create story file: `stories/your-feature/YourComponent.stories.tsx`
2. Story will auto-load (matches pattern: `stories/**/*.stories.tsx`)
3. Use CSF3 format (Component Story Format v3)
4. Add controls for interactive props
5. Include multiple scenarios

## Examples

### Map Framework Switcher

- **LeafletCesium.stories.tsx** - Interactive 2D↔3D transition demo
