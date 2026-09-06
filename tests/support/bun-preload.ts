import { mock } from "bun:test";

// `server-only` throws on import outside the react-server condition, and the
// modules under test (lib/cell-graph.ts, lib/occurrences.ts, the server
// actions) all import it. Bun has no resolver aliases, so stub the module
// itself — the equivalent of the old vitest `resolve.alias` entry.
await mock.module("server-only", () => ({}));
