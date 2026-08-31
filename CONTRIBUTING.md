# Contributing to carma

Thanks for taking the time. This document describes how work gets into this repository: setup, branches, checks, commits and pull requests. Please also read the [Code of Conduct](CODE_OF_CONDUCT.md). Security findings do not belong in issues; see [SECURITY.md](SECURITY.md).

## Before you start

Open an issue before writing code for anything larger than a bug fix. carma carries production applications for several municipalities, and a change that looks local often touches a shared library used by a dozen apps. Discussing the approach first is cheaper than reworking a pull request.

## Setup

You need Node.js 20 (the version CI uses) and npm. Install with:

```bash
git clone https://github.com/cismet/carma.git
cd carma
npm install
```

Customer-specific code lives in separate repositories, mounted as git submodules under `libraries/collaboration` and `cage`. To fetch or refresh them:

```bash
npm run update
```

Two dependencies (`@cismet-dev/react-cismap-envirometrics-maps`, `@cismet-collab/rainhazardmaps-base-texts`) come from the cismet npm registry, and the collaboration submodules live in the `cismet-collab` organisation. Access is granted per project. Without it, `npm install` and the applications that depend on collaboration content will not build. Everything else in the monorepo works without that access.

Never edit files through the submodule mount inside `libraries/collaboration`. Change them in their own repository and update the submodule pointer.

## Branches

The base branch is `dev`, not `main`. Branch off `dev` and target `dev` in your pull request.

Name feature branches after the issue they close: `feature/<issue-number>-<short-slug>`, for example `feature/0776-highlight-from-filter`. Use `fix/<issue-number>-<short-slug>` for bug fixes. A branch that builds on another feature branch uses the parent as a prefix: `feature/<parent-branch-name>--<short-slug>`.

## Running things

carma is an Nx monorepo. Run targets through `npx nx`:

```bash
npx nx run <project>:serve            # development server
npx nx run <project>:build            # production build
npx nx run <project>:lint
npx nx run <project>:test             # Vitest for unit tests, Playwright for e2e
npx nx reset                          # clear the Nx cache after config or eslint changes
```

For a quick check while working, type-check the project instead of building it:

```bash
tsc -p apps/<app>/tsconfig.json --noEmit --incremental
```

A full build is worth it before you open the pull request, since that is what CI does.

## Code

Some rules are enforced by the custom ESLint plugin in `scripts/eslint/carma.eslint.plugin.js` and will fail the lint target:

- Import Cesium through `@carma/cesium`, not directly. Only `libraries/mapping/engines/cesium/api/` may import `cesium`.
- Import proj4 through `@carma/geo/proj`, not directly. Only `libraries/commons/geo/proj/` may import `proj4`.
- Libraries must not import `react-redux`. State is injected through props and callbacks; Redux stays in the applications.
- `geo/`, `math/`, `units/` and `engines-interop/` must not import React.
- `@carma/math` has no external dependencies at all.
- `libraries/mapping/engines/cesium/api/` may import only `cesium`, `@carma/units/*`, `@carma/geo/*` and `@carma/math`.

Beyond that: use the path aliases from `tsconfig.base.json` rather than long relative paths, import types with `import type` (verbatim module syntax is on), and put a shared concern into a library instead of copying it between applications. New production libraries should extend `tsconfig.strict.base.json`.

A `localStorage` key written from a library must be prefixed by the consuming application. Libraries never write to a global key.

Some dependencies are pinned on purpose and must not be upgraded: ESLint 8.57, Prettier 2.8.8, React 18, Vite 5, Vitest 1.6, `ua-parser-js` 1.0.40 (version 2 is AGPL).

Target zero lint warnings in new code. Playground projects under `playgrounds/` have relaxed rules.

## Commits

Write commit messages in English, even when the issue and the surrounding work are in German. Quoted error strings and identifiers keep their original language. Reference the issue number in the subject or the body.

Split large changesets into commits that each leave the repository buildable. Do not add AI co-authorship trailers.

## Pull requests

Open the pull request against `dev`. Describe what changed and how to check it. Keep AI attribution out of the description.

CI builds every project affected by your change with the production configuration. A pull request that does not build will not be merged.

To have CI deploy a preview of a project, add a `deploy` directive to the pull request description, wrapped in a fenced code block:

````
```
deploy: ["geoportal", "belis-desktop"]
```
````

The project names must match entries in `deployment-config.json`. The deploy parser currently fails when other markdown sits above the code block, so a pull request that requests a deployment should carry the directive and nothing else in its body.

Adding `skip-deploy` to a commit message body suppresses the deployment for that commit.

## Licence

carma is MIT licensed. By contributing you agree that your contribution is published under the same licence.

## Sinngemäße Übersetzung (nicht offiziell)

Die englische Fassung oben ist die verbindliche. Der folgende Text fasst sie auf Deutsch zusammen und ersetzt sie nicht.

Für alles, was über eine Fehlerkorrektur hinausgeht, bitte zuerst ein Issue aufmachen. In carma hängen Produktivanwendungen mehrerer Kommunen, und eine Änderung an einer gemeinsam genutzten Bibliothek wirkt schnell in ein Dutzend Anwendungen hinein.

Gebraucht werden Node.js 20 und npm. Nach `npm install` holt `npm run update` die Submodule mit dem kundenspezifischen Code. Zwei Pakete kommen aus der npm-Registry von cismet, und die Collaboration-Submodule liegen in der Organisation `cismet-collab`; der Zugang dazu wird projektweise vergeben. Ohne ihn lassen sich die Anwendungen mit Kundeninhalten nicht bauen, der Rest des Monorepos schon. Dateien in den Submodulen werden im jeweiligen Repository geändert, nie über den Mount unter `libraries/collaboration`.

Basiszweig ist `dev`, nicht `main`. Feature-Zweige heißen `feature/<Issue-Nummer>-<kurzer-Slug>`, Korrekturen `fix/<Issue-Nummer>-<kurzer-Slug>`, und ein Zweig auf einem anderen Feature-Zweig trägt dessen Namen als Präfix.

Befehle laufen über `npx nx`, für Zwischenstände reicht ein Typecheck mit `tsc --noEmit` statt eines vollen Builds. Vor dem Pull Request lohnt der Build, weil CI genau das tut.

Die Architekturgrenzen im ESLint-Plugin unter `scripts/eslint/carma.eslint.plugin.js` sind verbindlich: Cesium nur über `@carma/cesium`, proj4 nur über `@carma/geo/proj`, kein `react-redux` in Bibliotheken, kein React in `geo/`, `math/`, `units/` und `engines-interop/`, keine externen Abhängigkeiten in `@carma/math`. Ein `localStorage`-Schlüssel aus einer Bibliothek bekommt immer das Präfix der aufrufenden Anwendung. Die im englischen Abschnitt genannten Versionen sind bewusst festgehalten und werden nicht angehoben.

Commit-Nachrichten werden auf Englisch geschrieben, auch wenn Issue und Umfeld deutsch sind. Große Änderungen werden in Commits aufgeteilt, die einzeln baubar bleiben. Hinweise auf KI-Mitautorschaft gehören weder in Commits noch in Pull Requests.

Pull Requests gehen gegen `dev`. Soll CI eine Vorschau ausliefern, kommt eine `deploy`-Anweisung in einem Codeblock in die Beschreibung, und zwar als einziger Inhalt, weil der Parser sonst scheitert. Die Projektnamen müssen zu `deployment-config.json` passen. `skip-deploy` im Commit-Text unterdrückt das Deployment.

carma steht unter der MIT-Lizenz. Mit einem Beitrag stimmst du zu, dass er unter derselben Lizenz veröffentlicht wird.
