# @pavelpotemkin/utils

`Result` type and an axios-based HTTP client that never throws.

- `Result<T, E>` — `{ ok: true, value } | { ok: false, error }`, same shape and names as
  `@pavelpotemkin/portals-market-api-sdk` 2.x.
- `HttpClient` — every method returns `Result<T, HttpError>`; timeouts, `AbortSignal`, response schemas.
- One error class `HttpError` with `kind`.
- Schemas are structural: zod 3, zod 4 or anything with `safeParse`. zod is not a dependency.
- Peer dependency: `axios@^1.20.0`. ESM + CJS, `sideEffects: false`.

Upgrading from 1.x: see [CHANGELOG.md](./CHANGELOG.md).

## Install

```bash
npm install @pavelpotemkin/utils axios
```

## Result

```ts
import { ok, err, isOk, isErr, unwrap, type Result } from "@pavelpotemkin/utils";

const parse = (s: string): Result<number> => {
  const n = Number(s);
  return Number.isNaN(n) ? err(new Error(`not a number: ${s}`)) : ok(n);
};

const r = parse("42");
if (isOk(r)) r.value; // number
if (isErr(r)) r.error; // Error

unwrap(ok(1)); // 1
unwrap(err(new Error("x"))); // throws that error
```

`Result<T, E = Error>`, types `Ok<T>` and `Err<E>`. `ok()` returns `Ok<T>`, `err()` returns `Err<E>`; both are
assignable to any `Result` with a compatible `T`/`E`.

## HttpClient

```ts
import { HttpClient, isHttpError } from "@pavelpotemkin/utils";
import { z } from "zod";

const client = new HttpClient({
  baseURL: "https://api.example.com/api",
  headers: { "Content-Type": "application/json" },
  timeoutMs: 20_000, // default 0 — no timeout
});

// axios stays public: interceptors, defaults.adapter (mocks), direct calls.
client.axios.interceptors.request.use((config) => {
  config.headers.set("Authorization", `tma ${token}`);
  return config;
});

const User = z.object({ id: z.number(), name: z.string() });

const res = await client.get("/users/1", { schema: User }); // Result<{ id: number; name: string }, HttpError>
if (res.ok) {
  console.log(res.value.name);
} else if (isHttpError(res.error, "http") && res.error.status === 404) {
  // not found
} else {
  console.error(res.error.kind, res.error.message);
}
```

Methods: `get(path, options)`, `post(path, body, options)`, `put`, `patch`, `delete`, and
`request(method, path, body, options)`. Bodies are sent as JSON by axios.

Request options:

| Option | Meaning |
| --- | --- |
| `params` | Query. Arrays are joined with `,` (`ids=1,2`); `undefined`, `null` and empty arrays are skipped |
| `schema` | Response schema with `safeParse` (zod 3/4); the result type is inferred from it |
| `headers` | Request headers |
| `signal` | `AbortSignal` → `kind: "aborted"` |
| `timeoutMs` | Overrides the client `timeoutMs`; `0` — none → `kind: "timeout"` |
| `responseType` | `"json"` (default) or `"text"` (raw string as the value) |

Timeouts and cancellation work even with custom adapters that ignore `signal`: the client stops waiting and
also aborts the axios request. Only `AbortController` and `setTimeout` are used (no `AbortSignal.timeout`/`any`),
so older WebViews are fine.

The body is requested as text and parsed by the client: an empty body (204) gives `undefined`, a non-JSON 2xx body
is `kind: "parse"`. If an adapter returns an object (mock adapters), it is taken as the parsed body.

## HttpError

```ts
class HttpError extends Error {
  name: "HttpError";
  kind: "http" | "network" | "timeout" | "aborted" | "parse" | "validation";
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: string;     // path as passed to the client
  status?: number;      // http, parse, validation
  code?: string;        // `code` from a JSON error body
  data?: unknown;       // parsed body; for validation — the data that failed the schema
  body?: string;        // raw text when the adapter returned text
  issues?: ValidationIssue[]; // validation
  retryable: boolean;
  cause?: unknown;      // network/timeout/aborted: the original error
  isBadRequest; isUnauthorized; isNotFound; isRateLimited; isServerError; // only for kind "http"
}
```

| `kind` | When |
| --- | --- |
| `http` | Non-2xx response |
| `network` | No response: connection failed, the adapter or an interceptor threw |
| `timeout` | `timeoutMs` or axios `timeout` elapsed |
| `aborted` | Caller's `signal` fired or axios canceled the request |
| `parse` | 2xx body is not JSON |
| `validation` | 2xx JSON did not pass `schema` |

`message`: `"<METHOD> <endpoint>: HTTP <status>: <body.message | statusText>"` for `http`, a similar
`"<METHOD> <endpoint>: …"` line for the other kinds.

`retryable`: `true` for 429 (any method) and for 408/500/502/503/504, `network`, `timeout` on `GET`, `PUT`,
`DELETE`. `POST`/`PATCH` after a lost response are not retryable: reconcile the outcome instead.

`isHttpError(error, ...kinds)` is a type guard; with `"http"` it narrows `status` to `number`, with
`"validation"` — `issues` to an array:

```ts
if (isHttpError(error, "http") && error.status >= 500) …
if (isHttpError(error, "network", "timeout")) …
```

The constructor is public for tests and mocks; `message`, `code` and `retryable` have defaults:

```ts
new HttpError({ kind: "http", method: "POST", endpoint: "/bet", status: 422, data: { code: "LIMIT" } });
```

## Types

```ts
import type { Brand, ValidationSchema, ValidationIssue } from "@pavelpotemkin/utils";

type UserId = Brand<string, "UserId">;
```
