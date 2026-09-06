// `expect.extend` in tests/support/ui-setup.ts adds jest-dom's matchers at
// runtime; this teaches the compiler about them.
//
// @testing-library/jest-dom ships a ready-made `types/bun.d.ts` doing exactly
// this, but its package `exports` map does not expose that path, so it cannot
// be referenced under `moduleResolution: "bundler"`. The matcher types
// themselves are reachable through the `./matchers` entry point, so the
// augmentation is rebuilt here from those.
import type * as jestDom from "@testing-library/jest-dom/matchers";

declare module "bun:test" {
  // The empty body *is* the augmentation: it grafts the matcher signatures onto
  // bun's `Matchers` without adding any of its own.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Matchers<T = unknown>
    extends jestDom.TestingLibraryMatchers<unknown, T> {}
}
