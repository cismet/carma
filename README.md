# carma (cids Architecture for Reactive Mapping Applications)

![DALL·E 2024-05-13 17 39 11 - A dynamic and modern digital artwork representing the theme of GIS (Geographic Information Systems) and software development  The image should incorpo](https://github.com/cismet/carma/assets/837211/977be510-7928-404c-92c5-091a208a2358)

## Overview

Welcome to carma, a monolithic repository (monorepo) powered by Nx, designed to streamline the development of reactive GIS applications. This repository leverages the Vite bundler to optimize the build process and improve developer experience with efficient tooling and clear project structures.

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

   `npm run update`

to refresh the repo and update the public submodules

## Deployment and Operation

Every application in this repository builds to plain static files. There is no server-side rendering and no application server. Any web server that can serve a directory will do, including nginx, Apache or a static hosting service. The GitHub Actions workflows in `.github/workflows/` and `deployment-config.json` are how cismet deploys to GitHub Pages; they are convenience, not a requirement, and nothing in the build depends on them.

### Building an application

Build one application at a time. The project name is the key in the app's `project.json`:

```bash
npx nx run geoportal:build --configuration=production
```

The result lands in `dist/apps/<app>`, for example `dist/apps/geoportal`. Copy that directory to your web server and you are done.

If the application is served from a subdirectory rather than the root of a domain, pass the path through to Vite:

```bash
npx nx run geoportal:build --configuration=production --base=/geoportal/
```

### Serving the files

Almost all applications use hash-based routing, so the web server never sees the in-app route and needs no rewrite rules. A minimal nginx server block is enough:

```nginx
server {
    listen 80;
    server_name maps.example.de;
    root /var/www/geoportal;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

The `try_files` fallback matters only for `belis/online`, which is the one application using browser-based routing. For the others it is harmless.

Serve over HTTPS. Several applications request the browser geolocation API, which modern browsers only grant on a secure origin.

### Backend services

An instance needs more than the static files. The applications are clients for services that are operated separately:

- a cids/WuNDa server for the object and query interface (DAQ) used by the domain applications
- gazetteer data for the search
- WMS and WFS services for the map layers, usually operated by the municipality
- a tile server for vector and raster tiles, and rasterfari for the raster maps, see `services/`
- authentication against the cids server for the non-public applications

Which of these a given application needs depends on the application. The public topic maps get by with map services and gazetteer data; belis, lagis, verdis and wunda additionally need the cids backend and a login. The endpoints are configured per application in its source; there is no single runtime configuration file that can be edited after the build.

Without those services an instance builds and loads, but stays empty. Running carma outside of Wuppertal therefore means either connecting it to comparable services of your own or replacing the layer and data configuration of the applications you want to use.

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

`npm run update`

again, or just

`git submodule update --init --recursive --remote --checkout --force -- libraries/collaboration`

to force update to current remote state of the public submodules in the repository.

#### The cage submodule

`cage/cage-submodule` points at the private repository `cismet/cage`, so `npm run update` leaves it alone and the
directory stays empty for everyone without access. carma builds fine that way: caged addons resolve to nothing and
the components that would render them render nothing.

With access to `cismet/cage`, use

`npm run update-with-cage`

which updates every submodule including cage. `update-force` and `update-force-with-cage` are the same split for the
variant that also runs `nx reset` and `npm ci`.

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

Common custom carma types and type declarations for external libraries are defined in type-only packages. These packages use zero-build configuration: TypeScript consumes declaration files directly from source via path aliases, eliminating build steps for pure type definitions.

**Type-only packages:**
- `@carma-types` - Global types index ([`libraries/types/`](libraries/types/))
- `@carma-geo/types` - Geographic types ([`libraries/geo/types/`](libraries/geo/types/))
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

#### Cross-engine feature topology

For platform features that should remain mapping-engine-agnostic, prefer one shared feature package plus one explicit engine bridge package per mapping engine.

Example target shape:

```text
libraries/mapping/annotations/
  src/lib/core/*              # contracts, domain logic, DTOs, pure transforms
  src/lib/runtime/*           # engine-agnostic orchestration only, if needed

libraries/mapping/annotations/cesium/
  src/lib/runtime/*           # Cesium scene, widget, and primitive bindings

libraries/mapping/annotations/maplibre/
  src/lib/runtime/*           # MapLibre GL JS bindings

libraries/mapping/annotations/leaflet/
  src/lib/runtime/*           # Leaflet or react-cismap bindings
```

Dependency direction:

- `annotations` must not depend on Cesium, MapLibre GL JS, Leaflet, or `react-cismap`
- `annotations/cesium` may depend on `annotations`, `@carma-cesium`, and Cesium-specific helper packages
- `annotations/maplibre` may depend on `annotations` and MapLibre-specific helper packages
- `annotations/leaflet` may depend on `annotations` and Leaflet-specific helper packages
- bridge packages should not depend on each other

Why this shape is preferred:

- shared feature logic stays vendor-light, testable, and easier to reuse
- mapping-engine retirement or replacement is localized to one bridge package instead of leaking through the feature core
- apps can opt into the engine bridges they need without scattering engine checks through shared providers or domain logic

A concrete example of this pattern is documented in [`libraries/mapping/engines-interop/navigation-controls/README.md`](./libraries/mapping/engines-interop/navigation-controls/README.md).

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
