# Kiwi-Vue

&copy; werdenktwas GmbH, 2024–2026 - Licensed under the EUPL-1.2

Vue 3 companion library for the **Kiwi-Framework** backend.
Provides typed API bindings, reactive loading state management, structured error handling, sorting/validation utilities,
and a set of Vue components.

Designed to integrate with a [Kiwi-Framework](https://github.com/wer-denkt-was/kiwi-framework) application server.

## Installation

```sh
npm install @werdenktwas/kiwi-vue
```

**Peer dependency:** `vue ^3.5`

### Module exports

| Import path                        | Contents                                   |
|------------------------------------|--------------------------------------------|
| `@werdenktwas/kiwi-vue`            | Re-exports all modules as named namespaces |
| `@werdenktwas/kiwi-vue/api`        | Data models and error classes              |
| `@werdenktwas/kiwi-vue/services`   | API client, CRUD, loading, error handler   |
| `@werdenktwas/kiwi-vue/components` | Vue.js utility components                  |
| `@werdenktwas/kiwi-vue/utils`      | Sorting, validation, pagination helpers    |
| `@werdenktwas/kiwi-vue/tooling`    | Vite/unplugin build utilities              |

## API Binding

### Setting up the API client

Call `provideApi` once at the application root (inside a `setup` context). Child components and services access it via
`useApi`.

```ts
import { provideApi, JwtBearerToken } from '@werdenktwas/kiwi-vue/services'

// In a root component setup()
const credentials = ref(new JwtBearerToken(token))

provideApi({
  apiUrl: 'https://api.example.com/',
  credentials, // MaybeRefOrGetter<ApiCredentials> — reactive
})
```

#### Credentials

| Class / value                              | Authentication method                                                              |
|--------------------------------------------|------------------------------------------------------------------------------------|
| `missingCredentials`                       | No authentication                                                                  |
| `new UsernamePassword(username, password)` | HTTP Basic (`Authorization: Basic …`)                                              |
| `new JwtBearerToken(token)`                | Bearer token (`Authorization: Bearer …`); validates expiration via JWT `exp` claim |
| `bearerToken(token)`                       | Factory for a bearer-token `AuthenticateRequestFn`                                 |
| `httpBasic(user, pass)`                    | Factory for a Basic-auth `AuthenticateRequestFn`                                   |
| `addRequestHeader(name, value)`            | Add an arbitrary request header                                                    |

Compose multiple authentication functions with `AuthenticateRequestFn.compose(fn1, fn2, ...)`. A credential may also
provide a `rewrite` function to rewrite request URLs (e.g. for proxies).

`JwtBearerToken.isValid()` returns `false` once the token's `exp` claim is in the past — `provideApi` will throw
`CredentialsInvalid` on the next request.

### CRUD services with `basicCrudService`

`basicCrudService<T, ID>(entityType)` generates a class that implements `CrudService<T, ID>` against conventional REST
endpoints.

```ts
import { basicCrudService, useApiService } from '@werdenktwas/kiwi-vue/services'

interface User {
  id: number;
  name: string
}

class UserService extends basicCrudService<User, number>('User') {
}

// In a component setup()
const userService = useApiService(UserService)
```

| Method                      | HTTP call            | Description                     |
|-----------------------------|----------------------|---------------------------------|
| `findById(id, options?)`    | `GET /User/{id}`     | Returns `null` for 404          |
| `requireById(id, options?)` | `GET /User/{id}`     | Throws `EntityNotFound` for 404 |
| `findPage(options?)`        | `GET /User?{params}` | Returns `IPage<T>`              |
| `create(body)`              | `POST /User`         | Returns created entity          |
| `update(id, body)`          | `PUT /User/{id}`     | Returns updated entity          |
| `delete(id)`                | `DELETE /User/{id}`  | Returns deleted entity          |

#### Options

```ts
interface FindOptions {
  fieldset?: string
  fields?: string
  accelerate?: boolean
}

// extends FindOptions + Pagination
interface FindPageOptions {
  pageSize?: number
  pageNumber?: number
  filter?: Record<string, ParamValues> // extra query params
  sort?: Sort[] // [{ field: 'name', direction: 'asc' }]
}
```

The `accelerate` option requests a compact response format from the server (shared-reference encoding). The client
decodes it transparently.

#### Pagination model

```ts
interface IPage<T> {
  items: ReadonlyArray<T>
  pageSize: number;
  pageNumber: number
  totalPages: number;
  totalItems: number
}
```

Use `loadAllPages({ loadPage, pageSize?, sort? })` (from `utils`) to fetch all pages and merge them into a single array.

### Analytical report services

For analytics endpoints that support the Kiwi report query format:

```ts
import { basicReportService, useApiService } from '@werdenktwas/kiwi-vue/services'

class SalesReportService extends basicReportService('sales') {
}

const reportService = useApiService(SalesReportService)
const report = await reportService.queryReport({
  dimensions: ['region', 'month'],
  metrics: ['revenue', 'units'],
  slices: { region: { eq: 'EU' } },
  sort: [{ field: 'month', direction: 'asc' }],
})
```

The returned `AnalyticalReport` object provides methods for data transformation:

| Method                            | Description                                               |
|-----------------------------------|-----------------------------------------------------------|
| `columnArray(header)`             | Extract a single column as an array                       |
| `columnSum(header)`               | Sum all values in a numeric column                        |
| `projection(columns)`             | Select and/or transform columns                           |
| `extendColumns(columns)`          | Add computed columns alongside existing ones              |
| `groupBy(header)`                 | Returns a `Map` keyed by column value                     |
| `pivot(header)`                   | Returns `[key, AnalyticalReport][]` sub-reports per group |
| `aggregate(header, aggregations)` | Reduce groups to aggregated values                        |
| `collate()`                       | Convert rows to `Record<string, unknown>[]`               |

Slice predicates: `eq`, `gt`, `lt`, `ge`, `le`, `in`, `null`, plus `and`, `or`, `not` for compound expressions.

## Error Handling

### Provider and injection

Set up an `ApiErrorHandler` at or near your application root:

```ts
import { provideApiErrorHandler } from '@werdenktwas/kiwi-vue/services'

provideApiErrorHandler({
  transform: myTransformer,   // ApiErrorTransformer
  consumers: [myConsumer],    // Array<ApiErrorConsumer>
  inherit: true,              // forward to parent handler as well
})
```

Inject in any child component:

```ts
import { useApiErrorHandler } from '@werdenktwas/kiwi-vue/services'

const errorHandler = useApiErrorHandler()
```

If no provider is found, a fallback handler is used that logs a warning to the console.

#### `ApiErrorHandler` interface

```ts
errorHandler.handle(error)          // transform + dispatch to consumers
errorHandler.catch(promise)         // attach .catch() that calls handle(), rethrows
errorHandler.format(error)          // returns formattedMessage string only
errorHandler.wrapService(service)   // returns Proxy auto-handling all Promise rejections
```

`wrapService` is the recommended pattern for services — it wraps every method so that any rejected promise is
automatically routed through the handler without manual `.catch` calls at every call site:

```ts
const rawService = useApiService(UserService)
const userService = errorHandler.wrapService(rawService)

// Error from this call will be handled automatically before being rethrown
userService.findPage()
```

### Error transformers

A transformer is a function `(error: unknown) => ApiErrorDetails`:

```ts
interface ApiErrorDetails {
  error: unknown
  rawMessage: string // technical message
  formattedMessage: string // user-facing message
}
```

#### `simpleApiErrorTransformer`

Uses `error.message` (or a JSON/string representation) as both raw and formatted message. Good as a fallback.

#### `i18nErrorTransformer` — vue-i18n integration

Maps `ApiError` codes to translated messages using a vue-i18n translation namespace:

```ts
import { i18nErrorTransformer } from '@werdenktwas/kiwi-vue/services'
import { useI18n } from 'vue-i18n'

const { tm, rt } = useI18n()
const transform = i18nErrorTransformer({ tm, rt, messagesKey: 'errors' })
```

Translation keys in your i18n messages file:

```json
{
  "errors": {
    "entity-not-found": "The resource could not be found.",
    "entity-not-found[entityType=user]": "User '{id}' does not exist.",
    "forbidden": "Access denied."
  }
}
```

Key format: `"error-code"` for a generic match, or `"error-code[key=value,key2=value2]"` for a conditional match on
`ApiError.details`. The most specific (most conditions) matching key wins. Detail values in message templates use
`{{argumentName}}` placeholders.

#### `resourceErrorTransformer` — JSON resource objects

A plain-object alternative to i18n, suitable when internationalization is not required:

```ts
import { resourceErrorTransformer } from '@werdenktwas/kiwi-vue/services'

const transform = resourceErrorTransformer({
  'entity-not-found': 'The requested resource was not found.',
  'entity-not-found[entityType=user]': "User '{{id}}' does not exist.",
  'forbidden': 'You do not have permission to perform this action.',
})
```

The same key format and `{{placeholder}}` syntax applies as with `i18nErrorTransformer`. Multiple resource objects may
be passed; they are merged.

### Error consumers

A consumer is a function `(error: ApiErrorDetails) => void`. The built-in `consoleErrorConsumer` calls `console.error`.
Typical use is displaying a toast notification:

```ts
import { consoleErrorConsumer } from '@werdenktwas/kiwi-vue/services'
import type { ApiErrorConsumer } from '@werdenktwas/kiwi-vue/services'

const toastConsumer: ApiErrorConsumer = ({ formattedMessage }) => {
  toast.error(formattedMessage)
}

provideApiErrorHandler({
  transform: myTransformer,
  consumers: [toastConsumer, consoleErrorConsumer],
})
```

## Loading Service

`useLoading<T>()` creates a reactive loading service that manages async operations and exposes their state.

```ts
import { useLoading } from '@werdenktwas/kiwi-vue/services'

const users = useLoading<User[]>()

async function refresh() {
  await users.load(userService.findPage())
}
```

### `LoadingState<T>` variants

| State     | Shape                                        | Description            |
|-----------|----------------------------------------------|------------------------|
| `idle`    | `{ loading: 'idle' }`                        | Not yet started        |
| `pending` | `{ loading: 'pending', previousResult?: T }` | Operation in progress  |
| `loaded`  | `{ loading: 'loaded', result: T }`           | Completed successfully |
| `failed`  | `{ loading: 'failed', error: unknown }`      | Completed with error   |

When a new `load` is started while another is pending, the previous operation's result is silently discarded — only the
latest operation updates the state.
Upon starting a new load operation, the previous `AbortController` is aborted if one was provided.

### `load` options

```ts
// Second argument: boolean (pending = true/false) or LoadingOptions
await users.load(promise, { pending: true, abort: abortController })
```

- `pending` (default `true`): switch to `pending` state immediately. Pass `false` to stay in the current state until
  resolved — useful for background refresh without clearing the view.
- `abort`: an `AbortController` that is signalled if a newer `load` call supersedes this one, allowing the underlying
  request to be cancelled.

### Reactive helpers

```ts
users.state           // ShallowRef<LoadingState<T>>
users.isLoading       // ComputedRef<boolean>
users.resultOrNull    // ComputedRef<null | T>

users.replace(r => [...r, newItem])          // update loaded result in-place
users.reset()                                // back to idle

users.computeState(r => r.length)            // ComputedRef<LoadingState<number>>
users.computeResult(r => r.length, 0)        // ComputedRef<number>, pending → 0
users.resultOrElse([] as User[])             // ComputedRef<User[]>, pending → []

users.combineStates(otherState, (a, b) => ({ a, b })) // merge two loading states
```

## Utilities

### Sorting

```ts
import { Compare, sorting, Ordinal } from '@werdenktwas/kiwi-vue/utils'
```

`Compare<T>` is a comparator function `(a: T, b: T) => Ordinal` (values: `-1`, `0`, `+1`).

`sorting(compare?)` returns a function `(array: ReadonlyArray<T>) => T[]` — useful as a pipeline step.

```ts
const byName = Compare.byKey('name', Compare.caseInsensitive)
const sortUsers = sorting(Compare.compose(byName, Compare.byKey('id')))
const sorted = sortUsers(users)
```

| Comparator                    | Description                            |
|-------------------------------|----------------------------------------|
| `Compare.natural`             | JS `>` / `<` operators                 |
| `Compare.number`              | `a - b`                                |
| `Compare.caseInsensitive`     | `localeCompare` with base sensitivity  |
| `Compare.reverse(cmp?)`       | Reverse order                          |
| `Compare.byKey(key, cmp?)`    | Compare by object property             |
| `Compare.compareBy(fn, cmp?)` | Compare by computed value              |
| `Compare.compose(...cmps)`    | Chain comparators, first non-zero wins |
| `Compare.nullsFirst(cmp?)`    | Nullish values sort first              |
| `Compare.nullsLast(cmp?)`     | Nullish values sort last               |

### Validation

```ts
import { isNotEmpty, requireLength, validateEvery } from '@werdenktwas/kiwi-vue/utils'
```

A `ValidationRule<T>` is `(value: undefined | T) => boolean | string` — `true` means valid; `false` or a string means
invalid (string is the error reason).

A `Validation<T>` is a factory: `(message?: string | false) => ValidationRule<T>`.

```ts
const nameRule = validateEvery([
  isNotBlank('Name must not be blank'),
  requireLength({ max: 100 })('Name is too long'),
])
```

#### Built-in validations

| Validation                       | Checks                            |
|----------------------------------|-----------------------------------|
| `isNotEmpty`                     | Value is truthy                   |
| `isNotBlank`                     | String has non-whitespace content |
| `isPositive`                     | Number > 0                        |
| `isNegative`                     | Number < 0                        |
| `requireLength({ min?, max? })`  | String length in range            |
| `requireBetween({ min?, max? })` | Number in range                   |
| `requireMatches(regex)`          | String matches pattern            |
| `isValidEmail`                   | Basic e-mail format               |
| `isLikeInt`                      | Parseable as integer              |
| `isLikeFloat`                    | Parseable as float                |

#### Conditional and composite

```ts
validateIf(predicate, rule)        // apply rule only when predicate is true
validateIfNotBlank(rule)           // apply rule only when string is not blank
validateIfNotEmpty(rule)           // apply rule only when string is not empty
validateOptional(rule)             // apply rule only when value is truthy
validateAsInt(message, numRule)    // parse string as int, then apply numeric rule
validateEvery([...rules])          // AND — fails on first failure
validateSome([...rules])           // OR — succeeds if any rule succeeds
```

### Other utilities

```ts
import { loadAllPages } from '@werdenktwas/kiwi-vue/utils'

// Load all pages of a paginated endpoint into a flat array
const allUsers = await loadAllPages({
  loadPage: pagination => userService.findPage({ ...pagination }),
  pageSize: 200,
  sort: { field: 'id', direction: 'asc' },
})
```

```ts
import { deferPromise } from '@werdenktwas/kiwi-vue/utils'

const deferred = deferPromise<string>()
deferred.resolve('done')
await deferred // 'done'
```

```ts
import { delay } from '@werdenktwas/kiwi-vue/utils'

const result = await delay(500, fetch('/api/data'))
```

```ts
import { TODO, unreachable } from '@werdenktwas/kiwi-vue/utils'

// Throws at runtime, signals incomplete implementation to the compiler
const value = TODO('implement this branch')

// Exhaustive switch guard — TypeScript error if a case is missing
switch (...) {
  case ...: break;
  default: unreachable(state)
}
```

## Vue Components

### `<Loading>`

Renders one of four named slots based on a `LoadingState<T>` or `LoadingService<T>`.

```html

<Loading :state="users">
  <template #idle>
    <p>Press "Load" to fetch users.</p>
  </template>
  <template #pending="{ previousData }">
    <UserList v-if="previousData" :users="previousData" class="stale" />
    <Spinner v-else />
  </template>
  <template #loaded="{ data }">
    <UserList :users="data" />
  </template>
  <template #failed="{ error }">
    <ErrorMessage :error="error" />
  </template>
</Loading>
```

| Prop    | Type                                   | Description     |
|---------|----------------------------------------|-----------------|
| `state` | `LoadingState<T> \| LoadingService<T>` | State to render |

| Slot       | Bindings                 | Shown when              |
|------------|--------------------------|-------------------------|
| `#idle`    | —                        | `loading === 'idle'`    |
| `#pending` | `{ previousData?: T }`   | `loading === 'pending'` |
| `#loaded`  | `{ data: T }`            | `loading === 'loaded'`  |
| `#failed`  | `{ error: unknown }`     | `loading === 'failed'`  |
| `#unknown` | `{ unreachable: never }` | Exhaustiveness guard    |

The `#pending` slot receives `previousData` when the service has a result from a prior load — useful for showing stale
data while refreshing.

Passing a `LoadingService<T>` directly (instead of `LoadingState<T>`) is equivalent to passing `service.state.value`.

### `<ErrorBoundary>`

Catches errors thrown by child component trees using Vue's `onErrorCaptured` hook and renders a fallback `#error` slot.

```vue

<ErrorBoundary stop-propagation @error-caught="logError">
  <template #default>
    <UserProfile :id="userId" />
  </template>
  <template #error="{ error, info, resetError }">
    <div class="error-panel">
      <p>Something went wrong: {{ error.message }}</p>
      <button @click="resetError">Try again</button>
    </div>
  </template>
</ErrorBoundary>
```

| Prop              | Type                | Description                                                        |
|-------------------|---------------------|--------------------------------------------------------------------|
| `stopPropagation` | `boolean`           | Prevent error from propagating to parent `ErrorBoundary` instances |
| `consoleLog`      | `'warn' \| 'error'` | Log caught errors to the browser console                           |

| Event          | Payload                 | Fired when                                      |
|----------------|-------------------------|-------------------------------------------------|
| `error-caught` | `error: Error`          | An error is captured from the child tree        |
| `error-reset`  | `previousError?: Error` | `resetError()` is called from the `#error` slot |

| Slot       | Bindings                                                 | Shown when                 |
|------------|----------------------------------------------------------|----------------------------|
| `#default` | —                                                        | No error is active         |
| `#error`   | `{ error: Error, info: string, resetError: () => void }` | An error has been captured |

If no `#error` slot is provided, errors are captured but the `#default` slot continues to render.

## Vite Tooling

### `KiwiResolver`

Integrates with [`unplugin-vue-components`](https://github.com/unplugin/unplugin-vue-components) to enable automatic
component imports. With this resolver in place, `<Loading>` and `<ErrorBoundary>` can be used in templates without
explicit `import` statements.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { KiwiResolver } from '@werdenktwas/kiwi-vue/tooling'

export default defineConfig({
  plugins: [
    Vue(),
    Components({
      resolvers: [KiwiResolver()],
    }),
  ],
})
```

The resolver maps component names to the `@werdenktwas/kiwi-vue/components` entry point. TypeScript types for global
components are provided automatically via the `components/index.ts` module augmentation — add it to your `tsconfig.json`
includes if global type inference is needed.
