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

#### adding submodules:

`git submodule update --init --recursive`

#### Updating submodules:

`git submodule update --remote --recursive --merge`

## Development Guidelines

... Setup guide to be determined

### Dev Environment:

... node 20 or later

### Commit Guidelines

Before committing, ensure that the following conditions are met:

if only project is affect run nx build before pushing.

`npx nx build my-project-name`

for the whole project run

`npx nx run-many -t test`

make sure the submodules stay in sync

`git submodule update --remote --recursive --merge`

after updating the submodules one might need to skip the cache with

`npx nx reset`

or skip the cache directly with `--skipNxCache`

all projects should build before committing.

`npx nx run-many -t build --skipNxCache --nxBail`
`npx nx run-many -t lint --skipNxCache --nxBail`

additional checks:

`npx nx run-many -t build-storybook --skipNxCache --nxBail`
`npx nx run-many -t test --skipNxCache --nxBail`


### Typescript configuration

carma is using Typescript 5.5 as of July 2024
the projects are not transpiled by TypeScript itself and does not emit js.

[`tsconfig`](https://www.typescriptlang.org/tsconfig/) settings exist primarily for DX.

vite build and [`vite-plugin-dts`](https://www.npmjs.com/package/vite-plugin-dts) are taking care of the actual transpiling and typescript declaration.

#### For _new_ production level projects:

- `/tsconfig.strict.base.json` should be extending the local project `./tsconfig.json`.

- changes to [`compilerOptions`](https://www.typescriptlang.org/tsconfig/#compilerOptions) on a per project basis should be avoided.

#### For _new_ playground level projects:

- `/tsconfig.strict.base.json` is recommended but not required.
- `/tsconfig.base.json` can be used with local changes as needed.

#### For _existing_ production level projects:

- `/tsconfig.legacy.base.json` as lowest level of existing strictness permitted.
- `/tsconfig.base.json` as optional intermediate step
- `/tsconfig.strict.base.json` should be adopted, if feasible, on a per project commit basis.

#### handling code imports

Manually imported/copied `.js` and `.jsx` files that don't have any meaningful type safety checks (ts-ified by lots of _any_) should stay as `.js` and `.jsx` and not be renamed to `.ts` and `.tsx` or flagged with `ts-ignore` before proper type safety is implemented.
All configurations should allow importing `.js`

#### Types

common custom carma types and type declarations for external libraries
are to be added to their respective `/types/*.d.ts`

... tbd

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

### Linting

uses eslint flat config in 

`/eslint.config.cjs`

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
- storybook at v7
- prettier at 2.8.8
- vitest at 1.6

the remaining dev deps can be updated with

`npx npm-check-updates --dep dev --reject "eslint* *vitest* prettier *storybook*"`

and after sanity check

`npx npm-check-updates --dep dev --reject "eslint* *vitest* prettier *storybook*" -u`

### Updating prod packages

same as dev packages, but keep integration/migration heavy major upgrades like bootstrap or react-pdf-html at current versions

`npx npm-check-updates --dep prod --reject "\*bootstrap react-pdf-html graphql-request"`