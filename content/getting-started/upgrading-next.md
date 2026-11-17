---
title: Upcoming changes
description: Changes on main since 0.6.3 that can affect existing apps. This page becomes the upgrade guide for the next release.
---

# Upcoming changes

Changes for the next release are listed here as they land.

## CLI

- **`make:model` writes a plain class by default.** For a Megh ORM model
  (columns read from its migration), add `--orm`:
  `megh make:model user --orm`. `--template` and `--fields` still build a
  Megh ORM model without it.
- **`--orm` now means Megh ORM; TypeORM is `--typeorm`.** On `make:model`,
  `make:controller -m` and `make:service -m`, replace `--orm` with
  `--typeorm` in scripts that generate TypeORM entities or repository
  services. With `-m`, Megh ORM stays the default.
- **A resource can't be built on a plain class.** `make:resource`,
  `make:controller -m` and `make:factory` stop with a message if the model
  file is a plain class; regenerate it with `make:model <name> --orm --force`.
- **Generators write unit tests.** `make:service user` also writes
  `src/services/user.service.spec.ts`, and likewise for the other generators
  except `make:model` and the database ones. `make:resource` tests every
  service method and route. Pass `--notest` (or `-nt`) to skip them. New:
  `make:test` (`m:t`) writes a test for an existing file. See
  [CLI: Tests](/cli/generators#tests).
- **New `make:class` (`m:cls`)** writes a plain class in `src/classes/`.
- **The logo shows only with `megh -v` and `megh --info`.** `megh -v` now
  prints the logo, then `Megh v<version>`, instead of the bare version; a
  script that reads it should match `v(\d+\.\d+\.\d+)` on the last line, or
  use `npm ls @meghjs/cli`. `megh --help` and `megh new` no longer print the
  logo. New: `megh --info` adds the Node.js, OS and installed Megh package
  versions.

The changes that were on this page shipped in 0.6.0, 0.6.1 and 0.6.3. See
[Upgrading to 0.6](/getting-started/upgrading-0.6).
