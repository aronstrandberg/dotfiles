import { expect, test } from "bun:test"
import {
  parseRatchetBaseUrl,
  probeRatchetBuildRoute,
  RatchetBuildClient,
  RatchetError,
  RATCHET_UNAVAILABLE_MESSAGE,
} from "./ratchet.ts"
import type { BuildRef } from "./build-card.ts"

const ref: BuildRef = { organization: "lovable", pipeline: "deploy-production", number: 42 }
const address = "https://buildkite.com/lovable/deploy-production/builds/42"
const build = {
  ...ref,
  state: "failed",
  url: address,
  branch: "main",
  commit: "0123456789abcdef0123456789abcdef01234567",
  message: "Deploy production",
  createdAt: 1_700_000_000_000,
  startedAt: 1_700_000_005_000,
  finishedAt: 1_700_000_125_000,
  failedJobs: ["test"],
}

async function server(response: (request: Request) => Response | Promise<Response>) {
  const instance = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: response })
  return {
    url: `http://127.0.0.1:${instance.port}`,
    stop: async () => {
      await instance.stop(true)
    },
  }
}

test("parses only HTTP Ratchet base URLs", () => {
  expect(parseRatchetBaseUrl(undefined)).toBe("http://127.0.0.1:9876")
  expect(parseRatchetBaseUrl("https://ratchet.internal/")).toBe("https://ratchet.internal")
  expect(parseRatchetBaseUrl("https://ratchet.internal/service/")).toBe("https://ratchet.internal/service")
  for (const value of [
    "file:///tmp/ratchet",
    "ssh://ratchet",
    "not a url",
    "https://user:secret@ratchet.internal",
    "https://ratchet.internal?token=secret",
    "https://ratchet.internal#fragment",
    9876,
  ]) {
    expect(() => parseRatchetBaseUrl(value)).toThrow("Ratchet URL")
  }
})

test("loads one canonical build address from Ratchet without following redirects", async () => {
  const seen: string[] = []
  const standIn = await server((request) => {
    seen.push(request.url)
    return Response.json(build)
  })
  const client = new RatchetBuildClient({ baseUrl: standIn.url, timeout: 1_000 })

  try {
    expect(await client.build(ref, new AbortController().signal)).toEqual({
      ...build,
      state: { kind: "failed" },
    })
    expect(seen).toEqual([`${standIn.url}/builds?url=${encodeURIComponent(address)}`])
  } finally {
    await standIn.stop()
  }
})

test("maps every documented HTTP failure, redirects, malformed JSON, and unsafe bodies to one fixed error", async () => {
  const fakeSecret = "BUILDKITE_TOKEN=secret-do-not-expose"
  const cases: Array<{ readonly status: number; readonly body: string }> = [
    { status: 400, body: JSON.stringify({ error: fakeSecret }) },
    { status: 404, body: JSON.stringify({ error: "Buildkite build not found" }) },
    { status: 503, body: JSON.stringify({ error: fakeSecret }) },
    { status: 405, body: "method not allowed" },
    { status: 302, body: fakeSecret },
    { status: 200, body: "not json" },
    { status: 200, body: JSON.stringify({ ...build, extra: fakeSecret }) },
    { status: 200, body: JSON.stringify({ ...build, branch: undefined }) },
  ]

  for (const item of cases) {
    const standIn = await server(
      () =>
        new Response(item.body, {
          status: item.status,
          headers: item.status === 302 ? { location: "https://example.com/secret" } : {},
        }),
    )
    try {
      const loading = new RatchetBuildClient({ baseUrl: standIn.url, timeout: 1_000 }).build(
        ref,
        new AbortController().signal,
      )
      await expect(loading).rejects.toEqual(new RatchetError(RATCHET_UNAVAILABLE_MESSAGE))
      await expect(loading).rejects.not.toThrow(fakeSecret)
    } finally {
      await standIn.stop()
    }
  }
})

test("maps timeout and connection refusal to the fixed unavailable error", async () => {
  const slow = await server(
    () =>
      new Promise<Response>((resolve) => {
        setTimeout(() => resolve(Response.json(build)), 100)
      }),
  )
  const unused = await server(() => Response.json(build))
  const refused = unused.url
  await unused.stop()

  try {
    await expect(
      new RatchetBuildClient({ baseUrl: slow.url, timeout: 10 }).build(ref, new AbortController().signal),
    ).rejects.toEqual(new RatchetError(RATCHET_UNAVAILABLE_MESSAGE))
    await expect(
      new RatchetBuildClient({ baseUrl: refused, timeout: 100 }).build(ref, new AbortController().signal),
    ).rejects.toEqual(new RatchetError(RATCHET_UNAVAILABLE_MESSAGE))
  } finally {
    await slow.stop()
  }
})

test("does not follow a build redirect to a route that would return a valid build", async () => {
  let redirectTargetHits = 0
  const standIn = await server((request) => {
    const url = new URL(request.url)
    if (url.pathname === "/successful-build") {
      redirectTargetHits += 1
      return Response.json(build)
    }
    return new Response("redirect", {
      status: 302,
      headers: { location: `${url.origin}/successful-build` },
    })
  })

  try {
    await expect(
      new RatchetBuildClient({ baseUrl: standIn.url, timeout: 1_000 }).build(ref, new AbortController().signal),
    ).rejects.toEqual(new RatchetError(RATCHET_UNAVAILABLE_MESSAGE))
    expect(redirectTargetHits).toBe(0)
  } finally {
    await standIn.stop()
  }
})

test("preserves caller cancellation instead of translating it to an availability error", async () => {
  const slow = await server(() => new Promise<Response>(() => {}))
  const controller = new AbortController()
  const loading = new RatchetBuildClient({ baseUrl: slow.url, timeout: 1_000 }).build(ref, controller.signal)

  controller.abort(new DOMException("Caller left", "AbortError"))

  try {
    await expect(loading).rejects.toHaveProperty("name", "AbortError")
  } finally {
    await slow.stop()
  }
})

test("recognizes only the documented 400 JSON response as a reachable build route", async () => {
  for (const [response, expected] of [
    [Response.json({ error: "bad address" }, { status: 400 }), true],
    [Response.json({ error: "not found" }, { status: 404 }), false],
    [Response.json({ error: "unavailable" }, { status: 503 }), false],
    [new Response("redirect", { status: 302, headers: { location: "https://example.com" } }), false],
    [new Response("bad address", { status: 400 }), false],
  ] as const) {
    const standIn = await server(() => response.clone())
    try {
      expect(await probeRatchetBuildRoute({ baseUrl: standIn.url, timeout: 1_000 }, new AbortController().signal)).toBe(
        expected,
      )
    } finally {
      await standIn.stop()
    }
  }
})

test("does not follow a probe redirect to a route that would report the build route present", async () => {
  let redirectTargetHits = 0
  const standIn = await server((request) => {
    const url = new URL(request.url)
    if (url.pathname === "/present") {
      redirectTargetHits += 1
      return Response.json({ error: "bad address" }, { status: 400 })
    }
    return new Response("redirect", {
      status: 302,
      headers: { location: `${url.origin}/present` },
    })
  })

  try {
    expect(await probeRatchetBuildRoute({ baseUrl: standIn.url, timeout: 1_000 }, new AbortController().signal)).toBe(
      false,
    )
    expect(redirectTargetHits).toBe(0)
  } finally {
    await standIn.stop()
  }
})
