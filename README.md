# CARMA (Cids Architecture for Reactive Mapping Applications)

![DALL·E 2024-05-13 17 39 11 - A dynamic and modern digital artwork representing the theme of GIS (Geographic Information Systems) and software development  The image should incorpo](https://github.com/cismet/carma/assets/837211/977be510-7928-404c-92c5-091a208a2358)

## Overview

Welcome to CARMA, a monolithic repository (monorepo) powered by Nx, designed to streamline the development of reactive GIS applications. This repository leverages the Vite bundler to optimize the build process and improve developer experience with efficient tooling and clear project structures.

## Key Features

- **Nx Monorepo:** Utilizes Nx to facilitate better code sharing and tooling across multiple applications and libraries within the same repository.
- **Vite Bundler:** Employs Vite for fast and lean builds, enhancing development with rapid updates and optimized production builds.
- **GIS-Focused:** Tailored for developing GIS applications, integrating mapping technologies seamlessly with modern web technologies.
- **React Framework:** Built with React to create interactive UIs efficiently, making the application reactive and user-friendly.

## Getting Started

### Prerequisites

- Node.js (LTS)
- npm

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/cismet/carma.git
   cd carma
   ```

2. npm install

3. on dev branch you can also run the custom script

   `npm run update-all`

to refresh the repo and update all submodules

## Development Guidelines

### Dev Environment:

... node 20 or later

### Commit Guidelines

Before committing, ensure that the following conditions are met:

if only project is affected, run nx build before pushing.

`npx nx build my-project-name`

for the whole monorepot run,

`npx nx run-many -t build --nxBail`

to check that all projects build before committing.

Some possible additional Checks:

`npx nx run-many -t lint  --nxBail`

`npx nx run-many -t build-storybook --nxBail`

`npx nx run-many -t test --nxBail`

### Submodules

If build errors occur due to submodules run:

`npm run update-all`

again, or just

`git submodule update --init --recursive --remote --checkout --force`

to force update to current remote state of all submodules in the repository.

### Typescript configuration

carma is using Typescript 5.5 as of July 2024
the projects are not transpiled by TypeScript itself and does not emit js.

[`tsconfig`](https://www.typescriptlang.org/tsconfig/) settings exist primarily for DX.

vite build and [`vite-plugin-dts`](https://www.npmjs.com/package/vite-plugin-dts) are taking care of the actual transpiling and typescript declaration.

#### Connector `tsconfig.json` rule (all libs/apps)

- use exactly one base extend in connector `tsconfig.json`:
  - [`/tsconfig.base.json`](/tsconfig.base.json) as default.
  - [`/tsconfig.legacy.base.json`](/tsconfig.legacy.base.json) only when dependency compatibility issues require fallback.
- no custom project-level [`compilerOptions`](https://www.typescriptlang.org/tsconfig/#compilerOptions) in connector `tsconfig.json`.

#### handling code imports

Manually imported/copied `.js` and `.jsx` files that don't have any meaningful type safety checks (ts-ified by lots of _any_) should stay as `.js` and `.jsx` and not be renamed to `.ts` and `.tsx` or flagged with `ts-ignore` before proper type safety is implemented.
All configurations should allow importing `.js`

#### Types

Common custom CARMA types and type declarations for external libraries are defined in type-only packages. These packages use zero-build configuration: TypeScript consumes declaration files directly from source via path aliases, eliminating build steps for pure type definitions.

**Type-only packages:**
- `@carma/types` - Global types index ([`libraries/types/`](libraries/types/))
- `@carma/geo/types` - Geographic types ([`libraries/commons/geo/types/`](libraries/commons/geo/types/))
- `@carma/units/types` - Branded unit types with [Radians-first convention](libraries/commons/units/types/BRANDED-UNITS.md) ([`libraries/commons/units/types/`](libraries/commons/units/types/))

**Configuration:** Type-only packages have no build target. Their `package.json` points exports directly to source (e.g., `"types": "./src/index.d.ts"`), and path aliases in `tsconfig.base.json` resolve directly to `.d.ts` files. This approach requires no compilation since TypeScript natively reads declaration files.

#### verbatim Module Syntax

types are enforced to be imported separately from the module.
e.g.:

```
import type { ReactNode } from "react";
import { useEffect } from "react";
```

not mixed in like

```
import React, { useEffect, ReactNode } from "react";
```

#### import order

Use this canonical import order in repo code:

1. `react`, `react-redux`, and Node built-ins
2. true third-party packages such as `antd`, `d3`, `leaflet`, `maplibre-gl`, `three`, Storybook, Vitest, and similar vendor modules
3. repo first-party packages that are not `@carma-*`, especially `react-cismap`, `react-cismap/*`, `@cismet-dev/*`, and `@cismet/*`
4. monorepo packages under `@carma-*`
5. local relative imports
   - order local relative imports from far to near (for example `../../foo` before `../foo` before `./foo`)
   - do not jump across monorepo library boundaries with relative paths; use the package alias/import surface instead
6. side-effect imports last, especially CSS, widget styles, and other asset-only imports such as `import "cesium/Build/Cesium/Widgets/widgets.css";`

Keep import blocks stable and alphabetized within each block.

### Linting

uses eslint flat config in

[`/eslint.config.cjs`](/eslint.config.cjs)

can be run per project with

`npx nx run [projectname]:lint `

Default ruleset is `tseslint.configs.strictTypeChecked.`
with some custom react and a11y rules.

desirable should be 0 warnings for added code.

for nx to register changes to the file, one might need to clear the cache with

`npx nx reset`

or run with skip cache option

`npx nx run [projectname]:lint --skipNxCache`

## Updating the Monorepo

### Updating the Nx CLI

Always do nx updates with the provided migrate utility.

-- `npx nx migrate nx@latest`

(prerequisites: have `npm-check-updates` installed globally with `npm install -g npm-check-updates`)

until further notice keep:

- eslint at 8.57
- prettier at 2.8.8
- react at 18
- vite at v5 (no v6 support in nx yet)
- vitest at 1.6
- ua-parser-js at 1.0.40 (v2 has AGPL license)

the remaining dev deps can be listed

`npx npm-check-updates --dep dev --reject "eslint* vite* @vitest* prettier *storybook* react* @types"`

update the individual packages as needed or use interactive mode for batch updates.

`npx npm-check-updates --dep dev -i `

### Updating prod packages

should happen on a per package basis only as needed and has no update policy yet.
be sure to check and update the complementing @types packages in dev deps as well.
