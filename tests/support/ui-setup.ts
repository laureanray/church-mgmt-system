// Preloaded only by `bun run test:ui`. The unit suite in `lib/` stays on bun's
// bare globals: registering a DOM there would let a module that reaches for
// `window` pass in tests and then fail on the server.
//
// Everything below the registration is imported *dynamically*, and that is not
// stylistic. ESM evaluates every static import before the first statement in
// this file runs, and `@testing-library/dom` builds its `screen` object at
// module scope from `document.body`. Import it statically and it captures an
// undefined document, leaving `screen.getByRole` throwing for the whole run
// while `render(...)` still works — a confusing half-failure.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const { afterEach, expect } = await import("bun:test");
const matchers = await import("@testing-library/jest-dom/matchers");
const { cleanup } = await import("@testing-library/react");

// Testing Library's matchers target jest/vitest `expect`, but bun implements
// the same interface, so they graft straight on: `toBeInTheDocument`,
// `toHaveAttribute`, `toHaveAccessibleName`.
expect.extend(matchers as unknown as Parameters<typeof expect.extend>[0]);

// Bun runs every test file in one process, so a component left mounted by the
// previous file is still in `document.body` for the next one. React Testing
// Library only auto-cleans when it can see a global `afterEach`, which it
// cannot under bun — wire it up explicitly.
afterEach(cleanup);

// `useRouter` throws "expected app router to be mounted" outside a Next tree,
// and Storybook's own Next mocks are not reachable from here: the framework
// package pulls in `storybook/preview-api`, which bun cannot resolve. Providing
// the context directly is both smaller and closer to what the app does.
//
// This goes through `setProjectAnnotations`, not a per-test wrapper, so it
// applies to every `composeStories` call in the suite — including stories that
// render a client component several levels down.
const React = await import("react");
const { setProjectAnnotations } = await import("@storybook/react");
const { AppRouterContext } = await import(
  "next/dist/shared/lib/app-router-context.shared-runtime"
);
const { testRouter, resetRouterCalls } = await import("./router");

setProjectAnnotations({
  decorators: [
    (Story: React.ComponentType) =>
      React.createElement(
        AppRouterContext.Provider,
        // The stub records rather than navigates; `tests/support/router.ts`
        // holds what it recorded.
        { value: testRouter as never },
        React.createElement(Story),
      ),
  ],
});

afterEach(resetRouterCalls);
