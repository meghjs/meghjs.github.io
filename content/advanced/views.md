---
title: Views
description: Server-rendered HTML with Blade-style templates.
---

# Views

<!-- v-pre: the page shows {{ }} template syntax, which Vue would otherwise evaluate. -->

:::: v-pre

Megh ships a template engine modelled on Laravel Blade: `{{ }}` echoes,
`@if` / `@foreach` directives, layouts, includes, stacks and `<x-component>`
tags. Templates compile to JavaScript once and are cached, so a render is a
function call. It has no dependencies.

## Setup

Point the app at your views folder. It defaults to `<cwd>/views`:

```ts [app.ts]
import path from "path";

app.useViews({ root: path.join(process.cwd(), "views") });
app.getViews().share("appName", "My App"); // available in every view
```

| Option      | Default                                | Meaning                                                                       |
| ----------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| `root`      | `<cwd>/views`                          | Folder holding the views                                                      |
| `extension` | `.megh.html`                           | Template file extension                                                       |
| `cache`     | `false` only in `NODE_ENV=development` | `false` recompiles a file when it changes, so edits show up without a restart |
| `maxDepth`  | `100`                                  | Guard against a view including itself forever                                 |

View names use dots: `layouts.app` is `views/layouts/app.megh.html`. Names
that would leave the views folder (`../secret`) are rejected.

## Returning a view

Return `Results.View` (or the `view` shorthand) from a controller or a
`mapGet` handler. It is sent as `text/html; charset=utf-8`:

```ts [controllers/home.controller.ts]
import { ApiController, Get, Results, view } from "@meghjs/core";

@ApiController("/")
export class HomeController {
  @Get("/")
  index() {
    return Results.View("home", { user: { name: "Ana" }, todos });
  }

  @Get("/gone")
  gone() {
    return view("errors.404", {}, 404).header("cache-control", "no-store");
  }
}

app.mapGet("/about", () => view("about"));
```

If a template throws, nothing has been sent yet, so the error goes through the
normal error handler and the client gets a 500.

::: warning Per-request data
`share()` data is global to the engine, which every request uses. Pass the
current user, CSRF token and similar values to `Results.View` instead.
:::

You can also render to a string anywhere, for example for an email:

```ts
import { getViewEngine } from "@meghjs/core";

const html = getViewEngine().render("emails.welcome", { user });
const inline = getViewEngine().renderString("Hi {{ name }}", { name: "Ana" });
```

## Syntax

| Syntax                                                                                             | Meaning                                              |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `{{ expr }}`                                                                                       | Echo, HTML-escaped. `expr` is any JS expression      |
| `{!! expr !!}`                                                                                     | Echo raw (unescaped). Only use it on trusted HTML    |
| `{{-- comment --}}`                                                                                | Removed at compile time                              |
| `@{{ x }}` / `@@if`                                                                                | Literal `{{ x }}` / `@if` (for Vue/Alpine)           |
| `@if(c)` `@elseif(c)` `@else` `@endif`                                                             | Conditionals                                         |
| `@unless(c)` … `@endunless`                                                                        | `if (!c)`                                            |
| `@isset(a.b.c)` … `@endisset`                                                                      | True if the path exists and isn't null. Never throws |
| `@foreach(items as item)` / `@foreach(obj as key => value)`                                        | Arrays, Maps, Sets, iterables and plain objects      |
| `loop.index` `.iteration` `.first` `.last` `.count` `.remaining` `.even` `.odd` `.depth` `.parent` | Like Blade's `$loop`                                 |
| `@for(let i = 0; i < 3; i++)` … `@endfor`, `@while(c)` … `@endwhile`                               | Plain JS loops                                       |
| `@break` `@continue` / `@break(cond)`                                                              | Loop control                                         |
| `@js(const x = 1)` / `@js … @endjs`                                                                | Raw JS (Blade's `@php`)                              |
| `@json(value)`                                                                                     | JSON that's safe inside `<script>`                   |
| `@csrf` `@method('PUT')`                                                                           | Hidden form inputs (`@csrf` reads `csrfToken`)       |
| `@include('partials.nav', { extra })`                                                              | Render another view                                  |
| `@extends('layouts.app')`                                                                          | Use a layout                                         |
| `@section('name')` … `@endsection` / `@section('title', 'Home')`                                   | Define a section                                     |
| `@yield('name', 'default')`                                                                        | Print a section                                      |
| `@section('sidebar')` … `@show`                                                                    | Define and print at once (inside layouts)            |
| `@parent`                                                                                          | Inside a child section: insert the layout's version  |
| `@push('scripts')` … `@endpush` / `@stack('scripts')`                                              | Collect content from many views                      |
| `<x-alert type="error" :count="n">` … `</x-alert>`                                                 | Component, `views/components/alert.megh.html`        |
| `<x-slot:title>` … `</x-slot>`                                                                     | Named slot. The rest is `{{ slot }}`                 |

A directive glued to a word is plain text, which keeps `support@example.com`
intact: write `done @endif`, not `done@endif`. Only registered directive names
are recognised, so `@media` in CSS stays as is.

## Layouts

```html [views/layouts/app.megh.html]
<!doctype html>
<html>
  <head>
    <title>@yield('title', 'My App')</title>
    @stack('styles')
  </head>
  <body>
    @include('partials.nav')
    <main>@yield('content')</main>
    @stack('scripts')
  </body>
</html>
```

```html [views/home.megh.html]
@extends('layouts.app')

@section('title', 'Home')

@section('content')
  <h1>Hello, {{ user.name }}</h1>

  <x-alert type="warning">
    <x-slot:title>Heads up</x-slot>
    You have {{ todos.length }} todos.
  </x-alert>

  <ul>
  @foreach(todos as todo)
    <li>{{ loop.iteration }}. {{ todo.title }}@if(todo.done) ✓@endif</li>
  @endforeach
  </ul>
@endsection

@push('scripts')
  <script>window.todos = @json(todos);</script>
@endpush
```

```html [views/components/alert.megh.html]
<div class="alert alert-{{ type }}">
  @isset(title)<strong>{{ title }}</strong>@endisset {{ slot }}
</div>
```

The child renders first and fills its sections, then the layout renders and
`@yield`s them. Anything the child prints outside a section is dropped, as in
Blade.

## Custom directives

A directive returns JavaScript source. Append to `__out` to print, and use
`__rt.escape()` to escape:

```ts
app
  .getViews()
  .directive("money", (args) => `__out += __rt.escape(formatMoney(${args}));`);
// {{-- in a view --}} @money(order.total)
```

## Scope

- **Includes** see the view's data plus the extras you pass, but not variables
  created inside the template. Inside a loop, write
  `@include('row', { row })`.
- **Components** are isolated: they only see their props and slots.
- **Stacks** render in order. A `@push` that runs after its `@stack` has
  printed won't appear. A page pushing into its layout works, because the
  child renders first.

## Errors

Errors name the template and line, with the original error in `err.cause`:

```
TemplateError: ReferenceError: nope is not defined (home:12)
Unclosed @if (home:4)
```

To see the generated code, use `compileTemplate(src).source`.

## Security

- **Templates are code.** `{{ }}` runs arbitrary JavaScript. Never compile
  templates written by users.
- **Escaping is HTML-only.** `{{ }}` is safe in element text and in quoted
  attributes. It is not safe in `href` (`javascript:` URLs; validate them),
  inside `<script>` (use `@json`), in unquoted attributes or in `style`.
- **Rendering is synchronous.** Load your data before returning the view.

::::
