---
name: go-coding-standards
description: Correct-by-construction Go standards. Use for Go engineering or when another skill needs the user's coding standards for Go code.
---

# Go Coding Standards

Build **correct by construction**. A principle applies when the change introduces or alters the concern it governs. Apply it across the change’s full semantic surface—contracts, behavior, data flow, state, effects, and verification—but do not introduce machinery for absent concerns. Follow compatible project conventions, containing incompatible conventions at their seams rather than copying them inward.

## Principles

### 1. Repository before invention

- Inspect existing packages, interfaces, adapters, tests, and `go.mod` dependencies before introducing a module, pattern, package, or seam.
- Make the smallest coherent improvement.
- Speculative abstractions and migration, rollout, or compatibility machinery require a concrete current constraint or explicit user intent.

### 2. Parse, don’t validate

- Treat external, serialized, persisted, framework-shaped, and configuration values as unknown boundary input.
- A boundary parser returns the refined value that flows inward: `func ParseX(dto XDTO) (X, error)`. Checking a field and then continuing with the DTO is not parsing.
- `json.Unmarshal` into a domain type is not parsing: it accepts missing fields as zero values and bypasses constructors. Decode into a DTO, then parse.
- Never trust decoded data with a bare type assertion; use the comma-ok form or a type switch, and treat `map[string]any` as unparsed input.
- Keep protocol and persistence DTOs, including struct tags, as explicit projections defined at the boundary. Domain types carry no `json`, `db`, or `protobuf` tags.
- Treat every serialization or process hop as a new boundary: cross it with explicit serializable DTOs and required context, then parse again.
- At the **composition root** (`main` or its `run` function), parse environment and flags once and translate raw platform capabilities (`*sql.DB`, SDK clients, `http.Client`) into typed configuration and narrow application capabilities.

### 3. Make invalid states unrepresentable

- A **Domain Module** is a pure, type-centric package in the OCaml abstract-data-type tradition. It centers one primary domain type or tightly related type family and co-locates its supporting types, invariants, parsers, constructors, combinators, predicates, legal transitions, domain projections, test generators, and `String` formatting.
- It owns its invariants through unexported fields and constructors returning `(T, error)`; callers use its operations rather than reimplementing checks or building values with struct literals or conversions, and persistence mirrors applicable invariants with constraints.
- Decide the zero value deliberately: either it is a valid value, or callers outside the package cannot obtain a usable one and methods treat it as a defect.
- Use precise operation inputs and required values; push optionality (pointers, `ok` booleans, `sql.Null*`) outward to the boundary.
- Prefer defined types (`type AccountID string`) for distinctions that prevent realistic misuse, and state machines over contradictory boolean flags.
- Model closed variants as a sealed interface (an unexported marker method) or an `iota` enum, and use **exhaustive case analysis** enforced by a linter such as `exhaustive` or `gochecksumtype`. Never use a `default` branch that masks newly added cases; a `default` that panics on an impossible value is acceptable.
- Slices and maps alias: copy them at construction and before returning them (`slices.Clone`, `maps.Clone`) when the receiver must stay immutable.

### 4. Expected failures are values; defects fail fast

- Define an **error algebra** per package: sentinel errors for conditions without data, and error struct types with safe structured fields and an optional wrapped cause for conditions with data. Callers match with `errors.Is` and `errors.As`, never by message text.
- Wrap with `%w` to keep the chain; use `%v` only when you deliberately hide the cause from callers.
- Expected failures are returned `error` values. `panic` is for defects, meaning broken invariants, and `recover` belongs only at goroutine, request, or job boundaries where the panic is converted to an error and reported.
- Handle or return every error. Discarding one requires an explicit `_ =` and a comment stating why it is safe.
- Inspect a returned error only where it can be classified, recovered from, or translated; otherwise wrap it with context and return it.
- Detect cancellation first: check `errors.Is(err, context.Canceled)` and `context.DeadlineExceeded`, or `ctx.Err()`, before classifying anything else.
- Retain original causes internally, but expose or record only explicit safe projections; an `Error()` string is a projection and must not include secrets or raw payloads.

### 5. Design deep modules around real seams

- Depth is caller leverage per unit of interface.
- An **Application Service Module** owns one cohesive use case or capability, applying application policy and sequencing effects through narrow ports.
- Ports are small interfaces declared by the consuming package, not the implementing one. Accept interfaces, return concrete types.
- An **Adapter Module** owns boundary translation and technology mechanics. It either:
  - translates an external request or event (HTTP handler, gRPC method, queue consumer) into an Application Service call and projects the result; or
  - implements an Application Service port using a framework, protocol, persistence store, runtime, or third party.
- Use a **functional core, imperative shell**: Domain Modules form the core; Application Services and Adapters form the shell.
- Raw external types stay at the composition root or inside Adapters.
- Every interface must hide meaningful invariants, policy, sequencing, or translation; reject package-level mutable state, mega-interfaces, and pass-through wrappers.

### 6. Every side effect has an owner

- Acquire each resource in the scope that owns its lifetime and release it on every exit with `defer` placed right after the successful acquisition. Check the error from `Close` on writers, where it reports lost data.
- `ctx context.Context` is the first parameter of every function that blocks, does I/O, or starts work. Do not store it in structs and do not replace a caller’s context with `context.Background()`.
- Enforce **no orphan goroutines**: every `go` statement has an owner that waits for it, cancels it, and receives its error and panics.
- Detached work has an explicit owner for lifetime, cancellation, error handling, and observability.
- Packages do not acquire resources, perform I/O, or start goroutines in `init` or package-level variable initializers.
- When independent work benefits from overlap, use **structured concurrency**: `errgroup.WithContext` with `SetLimit` to bound fan-out, propagate the caller’s cancellation, `Wait` for all children, and never let them outlive the owning scope.
- Guard shared mutable state with one clear mechanism (a mutex next to the fields it protects, or a single owning goroutine) and document which.

### 7. Make mutation retry-safe

- Make retried commands idempotent and guard concurrent transitions atomically (conditional updates, compare-and-swap, or row locks).
- Do not hold database transactions open across network calls; use a **transactional outbox** or equivalent when commit and delivery must agree. Pair every `BeginTx` with a deferred `Rollback`.
- Persist coordination state when progress must survive crashes or redelivery; introduce durable workflow machinery only when that need exists.

### 8. Observe without exposing

- Wrap sensitive values in a redaction-safe type at ingress and unwrap them only at the use site. The type implements `String`, `GoString`, `slog.LogValuer`, and `json.Marshaler` to emit a placeholder, so `%v`, `%+v`, `%#v`, structured logs, and JSON never print the value.
- Secrets never enter errors, logs, traces, metrics, snapshots, or diagnostic strings.
- Apply **data minimization** to correlated, structured telemetry: record only stable attributes for relevant operations, dependencies, states, retries, safe correlation identifiers, and error kinds; never log whole structs, request bodies, `err` values from untrusted sources, or the environment.
- Preserve existing reporting hooks, and keep telemetry out of domain decisions.

### 9. Verify behavior through real seams

- Assert caller-visible results, returned errors (via `errors.Is` or `errors.As`), persisted state, messages, responses, or adapter records—not unexported helpers or incidental call order.
- Replace dependencies through production seams with hand-written fakes; do not monkey-patch functions or package variables, and do not use mocks that assert call sequences.
- Control time, randomness, IDs, cancellation, and external behavior by injecting them; use `testing/synctest` for code that sleeps or uses timers.
- Use **risk-based testing**: match evidence depth to consequence.
- Use property tests (`testing/quick` or `rapid`) and fuzz tests (`testing.F`) for general invariants and parsers.
- Run tests with `-race` when the change touches concurrency, and check for leaked goroutines where the change starts any.
- Verify database and runtime claims against the actual implementation, applying the production migration path when persistence semantics matter.

### 10. Preserve Go’s checks

- Keep `go vet`, `staticcheck`, and the project’s `golangci-lint` configuration passing, and keep contracts precise.
- Avoid `any` in contracts where a concrete type or a generic type parameter fits, unchecked type assertions, `reflect` shortcuts, and hidden mutation through shared slices, maps, or pointer receivers.
- Treat `unsafe`, `//nolint`, `//go:linkname`, and similar escape hatches as unsafe blocks: keep each local behind a precise interface, and use a `SAFETY:` comment to state the runtime invariant that makes it sound. Every `//nolint` names the linter and the reason.
- Document every exported identifier with a godoc comment that starts with its name and explains its contract, invariants, side effects, and returned error conditions; mention `panic` only for defects or contracts that require it.
- Never weaken project-wide checks for a local change.

## Completion criterion

Treat every principle as a **proof obligation** against the full semantic change. Done means each is either inapplicable or supported by repository inspection, static checks, focused tests, or evidence from the actual runtime. For each blocked obligation, report the unsupported claim, blocker, risk, and remaining check; do not present it as verified.
