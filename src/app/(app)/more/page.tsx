import Link from "next/link";

const moreDestinations = [
  {
    href: "/recurring",
    title: "Recurring",
    description: "Manage repeating household transactions and generated entries.",
  },
  {
    href: "/settlements",
    title: "Settlements",
    description: "Review shared balances and settle up between household members.",
  },
  {
    href: "/investments",
    title: "Investments",
    description: "Track investment activity and holdings.",
    betaLabel: "Beta",
  },
  {
    href: "/settings",
    title: "Settings",
    description: "Manage your workspace, members, categories, security, and currency.",
  },
];

export default function MorePage() {
  return (
    <main>
      <div className="page-shell stack">
        <section className="page-header" data-testid="more-shell">
          <div>
            <span className="eyebrow">More</span>
            <h1>More</h1>
            <p>Household tools and workspace settings.</p>
          </div>
        </section>

        <nav className="more-destination-grid" aria-label="More destinations">
          {moreDestinations.map((item) => (
            <Link className="more-destination-card" href={item.href} key={item.href}>
              <span className="more-destination-title">
                <strong>{item.title}</strong>
                {item.betaLabel ? <span className="nav-chip">{item.betaLabel}</span> : null}
              </span>
              <span>{item.description}</span>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
