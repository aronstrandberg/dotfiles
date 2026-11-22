import { expect, test } from "bun:test"
import { buildAddress, parseBuildCardPayload, parseBuildCardRequest } from "./build-card.ts"

test("parses one canonical Buildkite address and drops an optional job fragment", () => {
  const ref = parseBuildCardPayload(" \nhttps://buildkite.com/lovable/deploy-production/builds/123456#019a-job-id\t")

  expect(ref).toEqual({
    organization: "lovable",
    pipeline: "deploy-production",
    number: 123_456,
  })
  expect(ref && buildAddress(ref)).toBe("https://buildkite.com/lovable/deploy-production/builds/123456")
})

test("rejects ambiguous, malformed, unsafe, and unsupported build references", () => {
  const invalid = [
    "",
    "123456",
    "https://buildkite.com/lovable/pipeline/builds/0",
    "https://buildkite.com/lovable/pipeline/builds/9007199254740992",
    "https://buildkite.com/lovable/pipeline/builds/1/jobs/job",
    "https://buildkite.com/lovable/pipeline/builds/1?job=abc",
    "https://buildkite.com/lovable/pipeline/builds/1#job#other",
    "https://buildkite.com/lovable/pipeline/builds/1 prose",
    "https://buildkite.com/lovable/pipeline/builds/1\nhttps://buildkite.com/lovable/pipeline/builds/2",
    "https://example.com/lovable/pipeline/builds/1",
  ]

  expect(invalid.map(parseBuildCardPayload)).toEqual(invalid.map(() => undefined))
})

test("parses only the strict build-card RPC request shape", () => {
  const request = { reference: "https://buildkite.com/lovable/pipeline/builds/1" }

  expect(parseBuildCardRequest(request)).toEqual(request)
  expect(() => parseBuildCardRequest({ ...request, extra: true })).toThrow("request")
  expect(() => parseBuildCardRequest({ reference: 1 })).toThrow("request")
})
