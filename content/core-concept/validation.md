---
title: Validation
description: Validating request bodies and query strings with DTOs, custom and async validators, and shaping responses with Expose and Exclude.
---

# Validation

Megh validates request input with DTOs: classes whose properties carry
validation decorators. Use a DTO as the type of a `@Body()` or `@Query()`
parameter, and validation runs before your handler.

The decorators come from `@meghjs/core`. They have the same names, options and
error messages as [class-validator](https://github.com/typestack/class-validator)
and [class-transformer](https://github.com/typestack/class-transformer), and
Megh compiles each DTO's rules once into a single function, so validation is
much faster. You don't need to install class-validator or class-transformer.
DTOs written with them keep working if they are installed; see
[Switching from class-validator](#switching-from-class-validator).

## Defining a DTO

```ts [dtos/create-user.dto.ts]
import { IsString, IsInt, IsEmail, IsOptional, Min, Max } from '@meghjs/core';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsInt()
  @Min(18)
  @Max(120)
  age: number;

  @IsOptional()
  @IsString()
  bio?: string;
}
```

## Validating the body

Type the `@Body()` parameter with the DTO — that is all that is needed:

```ts [controllers/users.controller.ts]
import { ApiController, Post, Body } from '@meghjs/core';
import { CreateUserDto } from '../dtos/create-user.dto';

@ApiController('/users')
export class UsersController {
  @Post()
  create(@Body() body: CreateUserDto) {
    // body is a validated CreateUserDto instance
    return body;
  }
}
```

The handler receives the **DTO instance**, not the raw body: getters and
methods on the class work, and [`@Type` and `@Transform`](#converting-values)
have been applied.

### Unknown properties are rejected

A property that is not declared on the DTO fails with 400, which prevents mass
assignment. Arrays and primitives sent to an object DTO are rejected too. To
accept a property without checking it, mark it with `@Allow()`.

### Error response

When validation fails the request is rejected with **400** before the handler
runs:

```json
{
  "code": 400,
  "status": "Error",
  "message": "email must be an email",
  "errors": [
    {
      "path": "email",
      "constraints": { "isEmail": "email must be an email" }
    }
  ]
}
```

`message` joins all messages with `; `. Nested properties use dotted paths
such as `address.city` and `items.0.name`.

Every decorator takes a `message` option, as a string or a function.
`$property`, `$value`, `$target` and `$constraint1`, `$constraint2`… are
filled in:

```ts
@MinLength(8, { message: '$property needs at least $constraint1 characters' })
password: string;
```

### Without decorator metadata

tsx, esbuild and SWC do not emit decorator metadata, so Megh cannot see the
parameter type. Pass it explicitly:

```ts
create(@Body({ type: CreateUserDto }) body: CreateUserDto) {}
```

Without metadata, a `@Body()` or `@Query()` with no `type` stops startup with
an error that names the route and the compiler setting, rather than leaving
the DTO unvalidated. Pass `{ validate: false }` to take the raw value.

## Validating the query string

The same applies to `@Query()`. Query values arrive as strings; Megh converts
them to the property's type (`?page=2` becomes the number `2`) before
validating:

```ts
export class ListUsersDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
}

@Get()
index(@Query() query: ListUsersDto) {
  return { page: query.page ?? 1 };
}
```

## Decorators

| Kind | Decorators |
|------|------------|
| Presence | `IsOptional`, `IsDefined`, `IsNotEmpty`, `IsEmpty`, `Allow`, `ValidateIf(condition)` |
| Type | `IsString`, `IsNumber(options?)`, `IsInt`, `IsBoolean`, `IsDate`, `IsArray`, `IsObject`, `IsEnum(entity)` |
| Values | `IsIn(values)`, `IsNotIn(values)`, `Equals(value)`, `NotEquals(value)` |
| Numbers | `Min(n)`, `Max(n)`, `IsPositive`, `IsNegative`, `IsDivisibleBy(n)` |
| Dates | `MinDate(date)`, `MaxDate(date)` (a `Date`, or a function returning one) |
| Strings | `MinLength(n)`, `MaxLength(n)`, `Length(min, max?)`, `Matches(pattern, modifiers?)`, `IsEmail(options?)`, `IsUUID(version?)`, `IsUrl(options?)`, `IsTimeZone` |
| String formats | `IsNumberString`, `IsBooleanString`, `IsDateString`, `IsISO8601`, `IsAlpha`, `IsAlphanumeric`, `IsAscii`, `IsLowercase`, `IsUppercase`, `Contains(seed)`, `NotContains(seed)`, `IsJSON`, `IsJWT`, `IsHexColor`, `IsHexadecimal`, `IsMongoId`, `IsIP(version?)`, `IsBase64`, `IsCreditCard`, `IsCurrency`, `IsDecimal`, `IsFQDN`, `IsLatLong`, `IsPostalCode(locale)`, `IsSemVer`, `IsMobilePhone(locale?)`, `IsStrongPassword(options?)`, `IsPhoneNumber(region?)` |
| Objects | `IsNotEmptyObject(options?)`, `IsInstance(Class)` |
| Arrays | `ArrayNotEmpty`, `ArrayMinSize(n)`, `ArrayMaxSize(n)`, `ArrayUnique(identifier?)`, `ArrayContains(values)`, `ArrayNotContains(values)` |
| Nested | `ValidateNested`, with `Type(() => Class)` |
| Conversion | `Type(() => Class, options?)`, `Transform(fn)`, `Expose(options?)`, `Exclude(options?)` |
| Custom | `Validate(Constraint)`, `ValidatorConstraint(options?)`, `registerDecorator(options)`, `ValidateBy(options)` |

They behave as their class-validator namesakes. Pass `{ each: true }` to check
every item of an array instead of the array itself:

```ts
@IsString({ each: true })
@MaxLength(20, { each: true })
tags: string[];
```

`IsOptional` skips the other rules when the value is `null` or `undefined`.
`ValidateIf((dto, value) => …)` skips them when the condition is false.

### Checks that need a package

`@IsEmail()` with default options and `@IsUUID()` are checked by Megh itself and
accept exactly the values class-validator accepts. `@IsUrl()`,
`@IsEmail(options)` with options and the checks in the **String formats** row
(except `IsPhoneNumber`) use the
[validator](https://github.com/validatorjs/validator.js) package, as
class-validator does; install it to use them:

```sh
npm i validator
```

`@IsPhoneNumber()` uses [libphonenumber-js](https://github.com/catamphetamine/libphonenumber-js),
as class-validator does:

```sh
npm i libphonenumber-js
```

A DTO that uses one of these without the package installed fails when the app
starts, with the `npm i` command to run.

An address containing an unpaired UTF-16 surrogate fails `@IsEmail` with the
normal 400 (class-validator throws on it, which becomes a 500).

## Nested objects

Mark the property with `@ValidateNested()` and give its class with
`@Type()`, so the value becomes an instance of that class and is validated
with its own rules. Arrays work the same way:

```ts
import { IsString, MinLength, ValidateNested, Type, IsArray } from '@meghjs/core';

class AddressDto {
  @IsString()
  @MinLength(2)
  city: string;
}

class ItemDto {
  @IsString()
  sku: string;
}

export class CreateOrderDto {
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items: ItemDto[];
}
```

Unknown properties are rejected inside nested objects too. Errors use dotted
paths: `address.city`, `items.1.sku`.

## Converting values

`@Type(() => X)` converts a value before it is validated: `Number`, `String`,
`Boolean` and `Date` convert primitives (`Boolean('false')` is `true`, as in
class-transformer), and a class turns a nested object into an instance.

`@Transform` changes a value with your own function. It receives
`{ value, key, obj, type, options }` and returns the new value:

```ts
import { IsIn, Transform } from '@meghjs/core';

export class ListUsersDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(['name', 'email'])
  sort: string;
}
```

Like class-transformer, a transform only runs for properties present in the
input; defaults set on the class (`sort = 'name'`) apply when it is missing.

### Different key names

`@Expose({ name })` reads a property from another key of the body, and writes
it back under that key in [responses](#shaping-responses):

```ts
export class CreateUserDto {
  @Expose({ name: 'first_name' })
  @IsString()
  firstName: string;
}
```

A body `{ "first_name": "Ada" }` gives `dto.firstName === 'Ada'`.

### Choosing a class from the input

When a property can hold several shapes, `@Type` with a `discriminator`
picks the class from a property of the value. Arrays work the same way, item
by item:

```ts
class CatDto {
  @IsString()
  name: string;
}

class DogDto {
  @IsString()
  name: string;

  @IsBoolean()
  goodBoy: boolean;
}

export class CreatePetDto {
  @ValidateNested()
  @Type(() => Object, {
    discriminator: {
      property: 'kind',
      subTypes: [
        { name: 'cat', value: CatDto },
        { name: 'dog', value: DogDto },
      ],
    },
  })
  pet: CatDto | DogDto;
}
```

The `kind` property is removed from the value before it is validated. Pass
`keepDiscriminatorProperty: true` to keep it (then declare it on each class,
for example with `@IsIn(['cat'])`).

## Custom validators

Write a class with a `validate` method and mark it with
`@ValidatorConstraint`, then use it with `@Validate`:

```ts
import { Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from '@meghjs/core';

@ValidatorConstraint({ name: 'isSlug' })
class IsSlugConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && /^[a-z0-9-]+$/.test(value);
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} must be a slug`;
  }
}

export class CreatePostDto {
  @Validate(IsSlugConstraint)
  slug: string;
}
```

The constraint key in errors is the `name` (`{ isSlug: 'slug must be a slug' }`),
or the class name when no name is given. Constraints passed as
`@Validate(Class, [a, b])` reach the validator as `args.constraints`.

To make a reusable decorator, use `registerDecorator`:

```ts
import { registerDecorator, ValidationOptions } from '@meghjs/core';

export function IsSlug(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isSlug',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value) => typeof value === 'string' && /^[a-z0-9-]+$/.test(value),
        defaultMessage: (args) => `${args!.property} must be a slug`,
      },
    });
}
```

### Async validators

A validator may return a promise, for example to check the database:

```ts
@ValidatorConstraint({ name: 'isEmailFree', async: true })
class IsEmailFree implements ValidatorConstraintInterface {
  async validate(email: string) {
    return !(await User.findBy('email', email));
  }

  defaultMessage() {
    return 'email is already registered';
  }
}
```

Request validation waits for async validators. DTOs without them are still
validated synchronously. To validate one by hand, use `validateDtoAsync`
(`validateDto` throws for a DTO with an async validator).

The validator class is created once, with no constructor arguments, and
reused.

## Shaping responses

`HttpResponse.Ok(data, Class)` and `HttpResponse.Created(data, Class)` return
`data` shaped by `Class`: only properties marked with `@Expose()` are kept,
converted to their declared types, and nested classes are shaped by their own
decorators:

```ts
import { Exclude, Expose, HttpResponse, Type } from '@meghjs/core';

class AuthorView {
  @Expose()
  name: string;
}

export class PostView {
  @Expose()
  id: number;

  @Expose({ name: 'post_title' })
  title: string;

  @Expose()
  @Type(() => AuthorView)
  author: AuthorView;
}

// In a controller:
return HttpResponse.Ok(post, PostView);
// { message: 'success', data: { id: 1, post_title: '…', author: { name: '…' } } }
```

`@Exclude()` drops a property (`@Exclude({ toPlainOnly: true })` drops it from
responses only), and `@Exclude()` on a class drops every property that isn't
`@Expose`d. `@Transform(fn, { toPlainOnly: true })` changes a value in
responses only.

The same conversions are available directly as `plainToInstance(Class, plain,
options?)` and `instanceToPlain(object, options?)`, with class-transformer's
names. They support the `excludeExtraneousValues`, `enableImplicitConversion`
and `exposeUnsetFields` options. `groups` and versions (`since`, `until`) are
not supported: an `@Expose` with `groups` is never applied.

## Switching from class-validator

Existing class-validator DTOs keep working as long as class-validator and
class-transformer are installed. They are optional peers of `@meghjs/core`:
an app whose DTOs all use Megh's decorators doesn't need them. To switch a
DTO, import its decorators from `@meghjs/core` instead:

```ts
import { IsString, MinLength } from 'class-validator'; // [!code --]
import { Type } from 'class-transformer'; // [!code --]
import { IsString, MinLength, Type } from '@meghjs/core'; // [!code ++]
```

Error responses, the values your handler receives and the
[OpenAPI](/microservices/openapi) schema stay the same.

Switch every decorator of a DTO at once. A DTO that mixes `@meghjs/core`
decorators with class-validator or class-transformer ones fails when the app
starts, because each library would only check its own rules. Nested DTOs
(`@Type(() => AddressDto)`) must use Megh's decorators too. Custom validators
move the same way: import `ValidatorConstraint`, `Validate` and
`registerDecorator` from `@meghjs/core`.

Once no DTO imports from them, uninstall the two packages:

```sh
npm uninstall class-validator class-transformer
```

What Megh does not support:

- validation groups (`groups`, `always`) and `@Expose` groups and versions
- class-validator's `useContainer`: a custom validator class is created with
  no constructor arguments
- class-validator decorators not in the [table](#decorators) (such as
  `IsLatitude`, `IsISBN`, `IsEthereumAddress`). Write them with
  [`registerDecorator`](#custom-validators) or keep that DTO on
  class-validator.

### Faster class-validator DTOs (experimental)

Apps that keep class-validator DTOs can have them validated by a function
compiled from class-validator's own rules:

```ts
const app = Megh.createApplication({
  experimental: { compiledValidation: true },
});
```

or set `MEGH_COMPILED_VALIDATION=1`. Results are the same as without it; DTOs
it cannot reproduce exactly (nested DTOs, `@Type`, `@Transform`, async
validators) are validated by class-validator as before. This option may change
in a minor release.

## Deriving DTOs

Rather than repeating fields, derive one DTO from another:

| Helper | Result |
|--------|--------|
| `PartialType(Dto)` | Every property optional — ideal for updates |
| `PickType(Dto, ['a', 'b'])` | Only the named properties |
| `OmitType(Dto, ['a'])` | Everything except the named properties |

```ts [dtos/update-user.dto.ts]
import { PartialType } from '@meghjs/core';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {}
```

The derived class keeps the validation and transformation rules of the
properties it keeps, from class-validator, class-transformer or Megh's own
decorators, along with their OpenAPI metadata and default values.
`PartialType` also marks every property `@IsOptional()`, so a missing field
passes but a present one is still checked.

The derived DTO doesn't extend the source: `instanceof CreateUserDto` is
`false` for an `UpdateUserDto`.

## Extra validators

Megh adds validators on top of the class-validator set:

```ts
import { IsArrayNotEmpty } from '@meghjs/core';

export class CreateOrderDto {
  @IsArrayNotEmpty({ message: 'An order needs at least one item' })
  items: number[];
}
```

`IsArrayNotEmpty` is the same check as `ArrayNotEmpty`, with its own constraint
key (`isArrayWithAtLeastOneElement`) and message. It is a Megh decorator, so a
class-validator DTO that uses it fails at startup as a mixed DTO; use
class-validator's `ArrayNotEmpty` there.

## Validating by hand

To run a DTO's validation outside a route, use `validateDto`:

```ts
import { validateDto } from '@meghjs/core';

const { value, errors } = validateDto(CreateUserDto, input);
if (errors) {
  // [{ path: 'email', constraints: { isEmail: 'email must be an email' } }]
}
```

`value` is the DTO instance and `errors` is `null` when the input is valid,
the same shape as the 400 response's `errors`. For DTOs with
[async validators](#async-validators), use `validateDtoAsync`. For
class-validator DTOs, use `transformAndValidate`, which works the same for
either kind of DTO but returns a promise:

```ts
import { transformAndValidate } from '@meghjs/core';

const { value, errors } = await transformAndValidate(CreateUserDto, input);
```

For input that does not come from a DTO, `validateOrThrow` checks a plain object
against a rule map and throws a `BadRequestException` on failure:

```ts
import { validateOrThrow } from '@meghjs/core';

validateOrThrow(
  { page: 1 },
  { page: { type: 'number', min: 1, required: true } },
);
```

Supported rule types are `string`, `number` (with `min`, `max`, `exact`) and
`boolean`, each accepting `required`, `optional` and a custom `message`.

- `number` accepts any finite number, including `0`.
- `boolean` accepts `true`, `false`, `"true"`, `"false"`, `0`, `1`, `"0"` and
  `"1"`.
- A value of `undefined`, `null` or `""` counts as missing.
