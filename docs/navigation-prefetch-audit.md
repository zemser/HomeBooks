# Navigation prefetch audit

Reviewed: 2026-08-14

## PREFETCH-001

The application uses framework-managed `next/link` prefetching. The source tree
contains no `prefetch={false}`, `prefetch={true}`, `router.prefetch()`, or custom
hover/focus prefetch wrapper. The app shell, feature pages, and feature clients
all use ordinary `<Link href={...}>` links.

Decision: keep the framework default for every current link. This preserves the
shared App Shell prefetch floor without adding per-link server work or bypassing
Next.js invalidation behavior.

## PREFETCH-002

`partialPrefetching: true` is enabled next to `cacheComponents: true`. Default
links now prefetch the destination App Shell; request-time financial data remains
behind the route's Suspense boundaries and is not prefetched as URL-specific data.

## PREFETCH-003

No URL-specific runtime prefetch is enabled. The app has links whose destinations
vary by `month`, `mode`, `transactionId`, `import`, and review queue parameters,
but those destinations read fresh, user-authorized financial data. Prefetching
each visible parameterized link would add server work without improving the
reliable shell-first experience. Those links continue to navigate through the
shared shell and stream the selected data after the click.

Revisit this decision only with measured evidence that a specific destination's
URL data is cacheable, sufficiently stable, and worth one server render per
visible link.
