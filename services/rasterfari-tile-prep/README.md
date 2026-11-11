# rasterfari-tile-prep

Turns PDF documents into the PNG tiles and `meta.json` files that the document viewer
(`@carma-commons/document-viewer`, used by bplan-auskunft and fnp-inspektor) loads from
`https://resources-wuppertal.cismet.de/tiles/`.

It runs as a container with cron. For each topic (`bplaene`, `aev`, `static`) it checks which documents are new or
changed, downloads those PDFs, renders every page, cuts it into tiles and copies the result into the tile storage.

## Origin

The source was moved here from `github.com/cismet/rasterfari-tile-prep` (commit `997e94c`, version `1.1.1`). The
files in `src/` were imported unchanged; the history before that lives in the old repository.

Image name: `cismet/carma-rasterfari-tile-prep` (before: `cismet/rasterfari-tile-prep-bplaene`).

## How the image is built

The `Dockerfile` starts from the last hand-built image, `cismet/rasterfari-tile-prep-bplaene:1.1.1`, and replaces
only `/app/src` with the files from this folder.

This is deliberate. The look of every tile depends on the exact versions of the renderers in that image
(Ghostscript 9.26, ImageMagick 6.9.7, Poppler 0.62, GDAL 2.3.2). The original Dockerfile installs them without
pinned versions, and the Node packages without a lock file, so a rebuild from scratch can change the output of
documents that nobody touched. If the runtime is ever rebuilt, compare the output for a set of documents with the
current image first (see "Checking a change").

Consequences:

- `package.json`, `node_modules`, `entrypoint.sh`, the default `crontab` and ImageMagick's `policy.xml` come from the
  base image. Their sources are in the old repository.
- The files in `src/` are plain JavaScript, run with `babel-node` inside the container. They are not part of any
  carma build, lint or test run.
- `src/lib/slack`, the helper for Slack notifications, is not part of the source. On the server it is supplied by
  a mount.

## Layout

| Path                         | Purpose                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `src/processing.js`          | Command line entry (`yarn run processing <command>`)                            |
| `src/lib/tilesTools.js`      | Finds new or changed documents per topic and compares them with the tile storage |
| `src/lib/getMissingFiles.js` | Downloads the PDFs                                                              |
| `src/lib/gdalTiling.js`      | Runs `c2t.sh` for every PDF, several in parallel                                |
| `src/lib/c2t.sh`             | One PDF: render pages to JPG, cut tiles, write `meta.json`                      |
| `src/gdal2tiles_ll.py`       | Tile cutter (gdal2tiles with a Leaflet-compatible layout)                       |
| `src/version.json`           | Version of this service, maintained by the deployment workflow                  |

## Output contract

The document viewer depends on this and nothing else:

- single page PDF `a/b/name.pdf`: tiles in `a/b/name.pdf/{z}/{x}/{y}.png`, metadata in `a/b/name.pdf/meta.json`,
- multi page PDF: tiles per page in `a/b/name.pdf-0/`, `a/b/name.pdf-1/`, ..., one `meta.json` in `a/b/name.pdf/`,
- `meta.json`: `layer0` ... `layerN` with `x`, `y` (page size in pixels at 300 dpi) and `maxZoom`, plus `pages`,
- spaces and umlauts in paths are replaced (`ä` becomes `ae`, space becomes `_`).

## Renderer selection

PDFs plotted by AutoCAD draw filled areas as thousands of small triangles. ImageMagick (through Ghostscript)
smooths the edge of every triangle separately, which leaves thin light stripes in the fills (cismet/wupp#4293).
Poppler renders these files cleanly, so `c2t.sh` picks the renderer per document:

| `C2T_RENDERER`   | Behaviour                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `auto` (default) | Poppler if `pdfinfo` reports AutoCAD as Creator or Producer, ImageMagick for everything else |
| `imagemagick`    | ImageMagick for every document (behaviour up to version 1.1.1)                              |
| `poppler`        | Poppler for every document                                                                  |

If Poppler fails on a page, the script falls back to ImageMagick for that document.

Cron does not pass the container environment on to its jobs. To set the variable for the scheduled runs, put it in
front of the command in the crontab file, for example `30 08 * * 1-5 C2T_RENDERER=imagemagick /usr/bin/yarn ...`.

## Running on the server

The server's compose file mounts the working folders, the tile storage, the crontab and a `config.json`:

```yaml
services:
  rasterfari-bpl-prep:
    image: cismet/carma-rasterfari-tile-prep:<version>
    volumes:
      - ./_tmp:/app/pictmpdir
      - ./_tmp:/app/_tmp
      - ./_in:/app/_in
      - ./_internal:/app/_internal
      - ./_out:/app/_out
      - ./_tarout:/app/_tarout
      - ./_logs:/app/_logs
      - ./slack:/app/src/lib/slack
      - <tile storage>:/app/_tilesstoragemount
      - <tar storage>:/app/_tartilesstoragemount
      - ./crontab:/etc/cron/crontab
      - ./config.json:/app/config.json
      - ./policy.xml:/etc/ImageMagick-6/policy.xml:ro
```

Use a fixed version tag there, not `latest` or `dev-latest`.

Crontab lines look like this (the entrypoint appends the log redirection, so do not add one):

```text
30 08 * * 1-5 /usr/bin/yarn --cwd /app/ run processing checkRetrieveAndTile --topicname=bplaene --maxProcesses 3 --upload
```

A document is tiled again when its PDF changed or when its `meta.json` is missing in the tile storage. Tiles that
already exist are not touched by a new image version.

## Releasing

Through the Deployment workflow with project name `rasterfari-tile-prep`:

- target `dev` pushes `cismet/carma-rasterfari-tile-prep:dev-latest`,
- target `live` with a release type (for example `patch`) raises `src/version.json` and pushes `:<version>` and
  `:latest`.

Do not run the `container` target locally; it pushes to Docker Hub.

## Checking a change

Build the image locally from the workspace root, without pushing:

```bash
docker build -f services/rasterfari-tile-prep/Dockerfile -t carma-rasterfari-tile-prep:test .
```

Tile a folder of PDFs offline. `_in`, `_out`, `_tmp` and `_internal` are scratch folders of your choice;
`config.json` can contain just `{}`:

```bash
docker run --rm --network none -w /app \
  -v "$PWD/config.json:/app/config.json:ro" \
  -v "$PWD/_in:/app/_in" -v "$PWD/_out:/app/_out" \
  -v "$PWD/_tmp:/app/pictmpdir" -v "$PWD/_internal:/app/_internal" \
  carma-rasterfari-tile-prep:test \
  /usr/bin/yarn --cwd /app/ run processing tile --in _in/test --out _out/test --topicname bplaene --maxProcesses 3
```

Tiles and `meta.json` end up in `_out/test/<name>.pdf/`, the rendered pages in `_tmp/_out/test/`.

Before a change goes live, run the same set of PDFs through the current image and through the new one and compare
the results file by file. Documents the change is not meant to affect must come out byte-identical. A useful set
contains at least: a scanned plan, an AutoCAD plan in A0, an AutoCAD plan in A4, a multi page scan and a multi page
text document.

On Windows, edit the scripts with LF line endings (the `.gitattributes` in this folder enforces it on commit).
