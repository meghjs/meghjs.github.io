---
title: Upcoming changes
description: Changes on main since 0.7.0 that can affect existing apps. This page becomes the upgrade guide for the next release.
---

# Upcoming changes

Changes on `main` since 0.7.0 are listed here as they land. They become the
upgrade guide for the next release.

The changes that were on this page before shipped in 0.7.0. See
[Upgrading to 0.7](/getting-started/upgrading-0.7).

## class-validator and class-transformer are optional

`@meghjs/core` no longer loads class-validator or class-transformer when it
starts. Both are now optional peers: an app whose DTOs use Megh's decorators
runs without them, and `megh new` no longer adds them to new projects.

Apps with class-validator DTOs keep working unchanged while the two packages
are installed. A class-validator DTO validated without class-transformer
installed fails with an error naming the package to install.

To drop them, switch each DTO's imports to `@meghjs/core` (see
[Switching from class-validator](/core-concept/validation#switching-from-class-validator)),
then run `npm uninstall class-validator class-transformer`.

## Everything a DTO needed class-validator for

These now come from `@meghjs/core`, with class-validator's and
class-transformer's names, options, constraint keys and messages:

- custom validators: `@ValidatorConstraint`, `@Validate`, `registerDecorator`,
  `ValidateBy`, `buildMessage`, including async validators
  ([guide](/core-concept/validation#custom-validators)). Request validation
  waits for them; `validateDtoAsync` validates by hand.
- `@Expose` and `@Exclude`, on properties and classes, and
  `plainToInstance` / `instanceToPlain`
  ([guide](/core-concept/validation#shaping-responses))
- `@Type` with a `discriminator` (it used to throw)
- `ArrayUnique`, `ArrayContains`, `ArrayNotContains`, `Equals`, `NotEquals`,
  `IsNotEmptyObject`, `IsInstance`, `MinDate`, `MaxDate`, `IsDivisibleBy`,
  `IsTimeZone`, `IsPhoneNumber` and the string-format checks
  (`IsDateString`, `IsNumberString`, `IsAlpha`, `IsMongoId`, `IsIP`, …). See
  the [table](/core-concept/validation#decorators).

`@IsUUID()` no longer needs the `validator` package.

## Things that behave differently

- **`IsArrayNotEmpty` is a Megh decorator.** It used to register a
  class-validator rule. A class-validator DTO that uses it now fails at
  startup, because it mixes the two libraries. Replace it with
  class-validator's `ArrayNotEmpty` in such DTOs, or switch the DTO to
  `@meghjs/core`. Its constraint key (`isArrayWithAtLeastOneElement`) and
  message are unchanged.
- **`HttpResponse.Ok(data, Class)` and `Created(data, Class)`** shape the data
  with Megh's conversion unless `Class` uses only class-transformer
  decorators, which keep using class-transformer. Results are the same; a
  response class that mixes Megh and class-transformer decorators now follows
  Megh's.
- **`transformAndValidate`** validates DTOs that use Megh's decorators with
  Megh's validator, as the router already did. Results are the same.
- **Generated code** (`megh new`, `make:dto`, `make:resource`,
  `scaffold:auth`) imports its decorators from `@meghjs/core`, and the test
  that `make:dto` writes uses `validateDto`.
