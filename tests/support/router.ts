/**
 * A stand-in for the App Router, shared by every UI test.
 *
 * Components that change table state through a menu — the facet filter, the
 * column picker — call `router.push` rather than rendering a link, because a
 * `menuitemcheckbox` is what announces "checked" to a screen reader and a link
 * dressed up with a tick is not. Recording the calls is what lets a test assert
 * where a click would have gone.
 */
export const routerCalls: { push: string[]; replace: string[] } = {
  push: [],
  replace: [],
};

export function resetRouterCalls() {
  routerCalls.push.length = 0;
  routerCalls.replace.length = 0;
}

export const testRouter = {
  push: (href: string) => {
    routerCalls.push.push(href);
  },
  replace: (href: string) => {
    routerCalls.replace.push(href);
  },
  refresh: () => {},
  back: () => {},
  forward: () => {},
  prefetch: () => {},
};
