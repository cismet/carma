# tgl-config-updater

Sidecar for `cismet/tileserver-gl` that keeps `config.json` in sync with the
vector services listed on `https://geoportal.wuppertal.de/about/services`.

It runs Playwright headless, scrapes every `*.style.json` URL the geoportal
exposes, derives the same style-ID that the geoportal sends at print time
(matching `getStyleName()` in `apps/geoportal/src/app/helper/print.tsx`),
writes a new `config.json` atomically, and commits the result to a git repo
in the config folder so every change is recoverable.

## Not an Nx workspace package

This folder lives in the carma monorepo for convenience (versioned next to
`apps/geoportal/src/app/helper/print.tsx`, whose `getStyleName()` it mirrors),
but it is **not** an Nx workspace package and is not consumed by any other
project in the repo.

The `package.json` here is a **standalone deployment manifest**: it pins the
exact `playwright` version that matches the Docker image tag used by the
sidecar (`mcr.microsoft.com/playwright:vX.Y.Z-jammy`). The container does
`npm install` from `/app` inside that image on first start, so the manifest
must travel with the script. Do not list this folder in `nx.json`,
`tsconfig.base.json` paths, or root `package.json` workspaces; it stays
deliberately detached so monorepo tooling ignores it.

## What it produces

```json
{
  "options": { "tileMargin": 128, "serveStaticMaps": true, ... },
  "styles": {
    "kita-style": {
      "style": "https://tiles.cismet.de/kita/style.json",
      "tilejson": { "bounds": [7.19, 51.26, 7.21, 51.28] }
    },
    "poi-bildungseinrichtungen-style": {
      "style": "https://tiles.cismet.de/poi/bildungseinrichtungen.style.json",
      "tilejson": { "bounds": [7.19, 51.26, 7.21, 51.28] }
    }
    // ... one entry per vector service discovered on the services page
  }
}
```

Style IDs are derived identically to the geoportal:

- `folder/style.json` -> `folder-style`
- `folder/foo.style.json` -> `folder-foo`
- Any character outside `[a-zA-Z0-9-]` is replaced with `-`

## Safety features

- **Stability wait.** The services page hydrates lazily; the script only
  accepts the URL list once it has been unchanged for 10 s.
- **Sanity check.** If the previous config had >10 entries and the new scrape
  returns fewer than 50 % of them, the run aborts without touching the file.
  Prevents a partial scrape from wiping the config.
- **Atomic write.** Writes to `config.json.tmp` and renames, so tileserver-gl
  never reads a half-written file.
- **Git history.** Every change is committed to the config folder's repo.
  Rollback is `git checkout <sha> -- config.json`.

## One-time host setup

### 1. Init the config folder as a git repo

```bash
cd /path/to/tgl-conf
git init
git config user.name  config-updater
git config user.email config-updater@local
printf '*.tmp\nnode_modules/\n' > .gitignore
git add config.json .gitignore
git commit -m "baseline"
```

(Optional but recommended: `git remote add origin <url>` and push, so the
history survives if the host disk dies.)

### 2. Wire the sidecar into docker-compose

Add a second service next to `tileserver-gl`. Adjust the `./updater` path so
it points at this folder from wherever your compose file lives.

```yaml
services:
  tileserver-gl:
    image: cismet/tileserver-gl
    network_mode: bridge
    volumes:
      - ./tgl-conf:/data
    environment:
      NODE_ENV: production
      VIRTUAL_HOST: tsgl4printing.cismet.de
      VIRTUAL_PORT: 8080
    restart: unless-stopped

  config-updater:
    image: mcr.microsoft.com/playwright:v1.49.0-jammy
    volumes:
      - ./tgl-conf:/data
      - /path/to/100-carma/scripts/tgl-config-updater:/app
    working_dir: /app
    command: >
      sh -c "npm install --omit=dev --no-audit --no-fund &&
             while true; do
               node update-config.js || echo '[updater] run failed';
               sleep 3600;
             done"
    restart: unless-stopped
    depends_on:
      - tileserver-gl
```

Notes:

- The Playwright image (~1.6 GB) already contains Chromium + system deps;
  no custom image required.
- `npm install` runs once per container start. If you'd rather avoid that,
  bake a tiny image: `FROM mcr.microsoft.com/playwright:v1.49.0-jammy` +
  `RUN npm i playwright@1.49.0` and use it instead.
- Hourly schedule is hard-coded in the `sleep 3600`. Change it or replace
  the loop with a host cron + `docker compose run --rm config-updater`.

### 3. (Optional) Reload tileserver-gl after a change

tileserver-gl does not pick up `config.json` changes at runtime. Two options:

- Restart it on its own schedule (`restart: unless-stopped` + a daily
  `docker compose restart tileserver-gl` cron).
- Mount the docker socket into the updater (`/var/run/docker.sock:/var/run/docker.sock`)
  and append `&& docker restart tileserver-gl` to the script's success path.

## Environment variables / flags

| Var / flag                | Default                                          | Purpose                                                  |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| `SERVICES_URL`            | `https://digital-twin-wuppertal-live.github.io/geoportal/#/about/services.md` | Page to scrape (`.md` variant; URLs are exposed as plain text)         |
| `CONFIG_DIR`              | `/data`                                          | Folder containing `config.json` and `.git/`              |
| `DRY_RUN=1` / `--dry-run` | off                                              | Scrape + diff only. No write, no commit, no git init.    |
| `CLEAN_UP=1` / `--clean-up` | off (additive)                                 | Replace `config.json` with exactly what was scraped. Default is additive: only adds new styles + refreshes URLs of existing ones, never removes. |

## Pinning an entry: `"protected": true`

Any style entry in `config.json` may carry a `protected: true` flag. Protected
entries:

- survive `--clean-up` even when they no longer appear on the services page,
- have their `protected` flag preserved across URL refreshes (so a routine
  additive cron run won't strip the flag when it updates the URL).

```json
"styles-bm-web-top": {
    "protected": true,
    "style": "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_top.json",
    "tilejson": { "bounds": [7.19, 51.26, 7.21, 51.28] }
}
```

Tileserver-gl ignores unknown style-entry fields, so the flag has no runtime
effect on tile serving. It's purely a hint for this updater.

## Two modes: additive (default) vs `--clean-up`

By default the updater is **additive**: it adds new scraped styles and
refreshes the URL of any existing style whose URL changed, but it **never
removes** an entry. This is the safest mode for a cron-scheduled sidecar,
because a transient scrape failure (page didn't fully load, services-page
backend hiccup, etc.) can never wipe entries from `config.json`.

Pass `--clean-up` (or set `CLEAN_UP=1`) when you actually want to prune
entries that disappeared from the services page. Recommended workflow:

1. Let the additive mode run on cron for routine refreshes.
2. Once in a while, run `--dry-run --clean-up` to see what would be pruned.
3. Run `--clean-up` for real when you've verified the prune list is sane.

The 50 %-shrink safety abort only applies in `--clean-up` mode; additive
mode can't shrink the file by definition.

## Dry run

Use `--dry-run` (or `DRY_RUN=1`) to preview what an update would do without
touching the file or the git repo. The script prints:

- The mode (`additive` or `clean-up`).
- A summary: scraped URL count, previous style count, next style count,
  and the lists of added / removed / changed style keys.
- A unified `diff -u` between the current `config.json` and the new one
  the script would have written.

The safety-abort threshold is not enforced in dry-run mode, so you can also
use it to investigate suspicious drops in the URL count.

```bash
# locally
CONFIG_DIR=/path/to/tgl-conf node update-config.js --dry-run

# via docker compose (one-shot)
docker compose run --rm config-updater node update-config.js --dry-run
```

## Local test (no docker)

```bash
cd scripts/tgl-config-updater
npm install
npx playwright install chromium

# dry-run first against your real config
CONFIG_DIR=~/Downloads node update-config.js --dry-run

# then a real run into a throwaway dir
mkdir -p /tmp/tgl-test
cp ~/Downloads/config.json /tmp/tgl-test/   # so prev-count check has a baseline
CONFIG_DIR=/tmp/tgl-test node update-config.js
diff -u ~/Downloads/config.json /tmp/tgl-test/config.json | head -50
```

If the diff is small (or only adds new vector services), the script is
working correctly.

## Rolling back

```bash
cd /path/to/tgl-conf
git log --oneline -- config.json    # find a known-good commit
git checkout <sha> -- config.json
# then restart tileserver-gl
```

## When it fails

- **`url list did not stabilize`** -> the services page took longer than 120 s
  to settle. Either bump `TIMEOUT_MS` or check whether the page is loading
  at all (try `SERVICES_URL` in a browser).
- **`safety abort: new count X < 50% of previous Y`** -> the scrape returned
  far fewer URLs than last time. Inspect the page manually; if the drop is
  real, delete `config.json` (the prev-count check is skipped when the file
  is missing) and re-run to accept the new baseline.
- **Style missing in tileserver-gl after update** -> verify the URL ended up
  in the page text (`curl -s "$SERVICES_URL" | grep style.json` only catches
  static HTML; for SPA content, open the page in a real browser and search).
