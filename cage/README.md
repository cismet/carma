# cage

`cage-submodule` is a private add-on repository mounted here as a git submodule. Carma reads it as source through the `@carma-cage/*` path alias, so there is no build step in between and no published package. Without access to that repository the submodule stays empty, and carma runs without the add-ons it provides.

This file covers the carma side. The procedure for changing cage lives in the cage repository's own `README.md`.

## The submodule has two legal states

**Pointing at a released commit.** The normal state. `.gitmodules` tracks the submodule's `main`, and `main` only moves when cage's release workflow runs. `npm run cage:update` fetches that commit, checks it out and stages the pointer.

**Hotlinked.** While someone is developing cage, `cage/cage-submodule/src` is a symlink into their local cage checkout, so their edits show up in a running dev server without a release. A hotlink is set up and taken down from the cage side.

Anything else is not allowed. In particular, do not fetch a cage commit straight into `cage/cage-submodule` and leave the pointer there: it looks like an ordinary checkout, and committing it records a commit nobody else can fetch.

## The pointer is invisible

`.gitmodules` sets `ignore = all` for this submodule, so a moved pointer never appears in `git status` or `git diff`. Two consequences:

- Staging it takes an explicit `git add cage/cage-submodule`. `npm run cage:update` does that for you.
- To see where it actually is, ask directly:

```bash
git submodule status cage/cage-submodule
```

A `+` in front of the hash means the checkout and the recorded pointer disagree.

## Spotting a hotlink

```bash
ls -ld cage/cage-submodule/src
```

A symlink means a hotlink is in place and the code being served is somebody's working copy, not the released commit the pointer names. `npm run cage:update` refuses to run in that state.

## Never commit an unreleased pointer

A carma commit pins an exact cage commit. If that commit only exists on one laptop, everyone else gets a checkout that cannot be fetched and a build that fails. Move the pointer only to a commit a release has put on cage's `main`, which is what `npm run cage:update` gives you.
