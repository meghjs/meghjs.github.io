---
title: LLM Tools
description: Turn Megh routes into LLM tools with @Tool() from @meghjs/ai. Every call runs through authentication, authorization and validation.
---

# LLM Tools

`@meghjs/ai` lets a language model call your API. Mark a route with
`@Tool()` and the model can call it as a tool, with Anthropic, OpenAI or any
SDK that takes JSON Schema tools.

- **One source of truth.** The tool's input schema is built from the route's
  path parameters, `@Query()` and `@Body()` DTO, the same ones used for
  validation and OpenAPI.
- **No back door.** A tool call is an HTTP request to the route, sent inside
  the process. Middleware, authentication, `@Authorized`, validation, rate
  limits and exception filters all run, exactly as they do for a browser.
- **Approval for side effects.** `confirm: true` marks a tool that changes
  data. It won't run until a person approves it.
- **Errors the model can fix.** A 400 comes back as the validation errors,
  not as an exception.

## Install

```sh
npm install @meghjs/ai
```

It's a [plugin](/advanced/plugins), so it's loaded automatically once it's
installed.

## Mark routes as tools

```ts
import { ApiController, Authorized, Body, Get, Param, Post } from "@meghjs/core";
import { Tool } from "@meghjs/ai";

@ApiController("/orders")
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Get("/:id")
  @Authorized()
  @Tool({ description: "Look up one order by its ID, with its items and status." })
  find(@Param("id") id: string) {
    return this.orders.find(id);
  }

  @Post("/:id/refund")
  @Authorized("admin")
  @Tool({ description: "Refund an order, fully or in part.", confirm: true, tags: ["admin"] })
  refund(@Param("id") id: string, @Body() body: RefundDto) {
    return this.orders.refund(id, body);
  }
}
```

| Option | Meaning |
|---|---|
| `description` | Required. What the tool does, written for the model: when to use it and what it returns. |
| `name` | The tool's name. Defaults to the controller and method in snake case: `OrderController.find` → `order_find`. |
| `confirm` | `true`: the tool has side effects and needs a person's approval. |
| `tags` | Labels for picking a set of tools: `app.tools({ tags: ["admin"] })`. |
| `maxOutput` | Largest response, in characters, sent back to the model (default 20 000). |

The model sees **one object** of arguments. For `refund` above that's
`{ id, amount, reason }`: the path parameter and the DTO's fields side by side.
When a body field has the same name as a path or query parameter, the body
goes under a `body` key instead.

A field is listed as required when the DTO marks it `@IsNotEmpty()` or
`@IsDefined()`, the same rule the OpenAPI docs use. Validation still checks
every rule, so if the model leaves out a field that is needed, it gets back a
400 it can correct.

## Give the tools to a model

Inject `ToolSet` (or call `app.tools()`) to get the tools, in the shape each
provider expects:

```ts
constructor(private readonly tools: ToolSet) {}  // every @Tool route

const tools = this.tools.filter({ tags: ["orders"] }); // or app.tools({ tags: ["orders"] })

tools.forAnthropic(); // [{ name, description, input_schema }]
tools.forOpenAI();    // [{ type: "function", function: { name, description, parameters } }]
tools.forMcp();       // [{ name, description, inputSchema, annotations }]
```

The set is read when it's used, so it's complete once the app has started.

## Run the model's tool calls

Pass the incoming request so the tools run **as the signed-in user**. Its
`authorization`, `cookie`, `x-api-key` and `x-request-id` headers are
forwarded:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { ToolSet } from "@meghjs/ai";

@ApiController("/assistant")
export class AssistantController {
  private readonly anthropic = new Anthropic();

  constructor(private readonly tools: ToolSet) {}

  @Post("/")
  @Authorized()
  async ask(@Body() body: AskDto, @MeghRequest() req: IRequest) {
    const tools = this.tools.filter({ tags: ["orders"] });
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: body.question }];

    for (let step = 0; step < 10; step++) {
      const res = await this.anthropic.messages.create({
        model: "claude-sonnet-5-5",
        max_tokens: 1024,
        tools: tools.forAnthropic(),
        messages,
      });
      messages.push({ role: "assistant", content: res.content });
      if (res.stop_reason !== "tool_use") return { answer: res.content };

      messages.push({ role: "user", content: await tools.anthropicResults(res.content, { request: req }) });
    }
    throw new BadRequestException("The assistant took too many steps.");
  }
}
```

For OpenAI, `tools.openAIResults(message.tool_calls, { request })` returns the
`tool` messages to append.

To run one tool yourself:

```ts
const result = await this.tools.call("order_find", { id: "42" }, { request: req });
// { ok: true, status: 200, data: {...}, content: '{"id":"42",...}' }
```

`call` never throws for a failed route. A 403, 404 or validation error comes
back with `ok: false`, its `status`, and a `content` the model can read.
Unknown or missing arguments are refused before the route is called.

## Approval

A `confirm: true` tool doesn't run unless the call says a person approved it:

```ts
const r = await tools.call("order_refund", args, { request: req });
if (r.needsConfirmation) {
  // Nothing ran. Ask the user, then:
  await tools.call("order_refund", args, { request: req, confirmed: true });
}
```

Inside `anthropicResults` and `openAIResults`, an unapproved tool comes back to
the model as an error that tells it so, and it can ask the user. In
development, Megh warns about a `POST`, `PUT`, `PATCH` or `DELETE` tool with
neither `confirm: true` nor `confirm: false`.

## Settings

```ts
app.useTools({
  maxOutput: 10_000,                           // characters sent back to the model
  forwardHeaders: ["authorization", "x-tenant"], // headers copied from `request`
  logArguments: false,                         // include arguments in the audit log
});
```

Each call is logged with the tool name, status, duration and request ID.
Arguments are left out unless `logArguments` is on, since they can contain
personal data.

## Safety checklist

- A tool can do whatever its route does, with the caller's rights. Expose only
  what a model should do, and keep `@Authorized` on anything that isn't public.
- Use `confirm: true` for every tool that changes data, unless the change is
  harmless.
- Give each route `@RateLimit`: an agent in a loop can call it faster than any
  person.
- Treat tool results as data. Text coming back from your API (a customer's
  note, a product description) can contain instructions meant for the model.

## See which routes are tools

`megh route:list` adds a **TOOL** column once the app has `@Tool` routes, and
`--json` adds a `tool` field. The [MCP server](/ai/mcp)'s `megh_list_ai_tools`
lists them with warnings, such as a tool that changes data without `confirm`
or without `@Authorized`.
