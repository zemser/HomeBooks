"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type AccountControlProps = {
  displayName: string;
  email: string;
};

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function AccountControlSkeleton() {
  return (
    <div className="app-account app-account-skeleton" aria-busy="true" aria-label="Account">
      <span className="app-account-avatar" />
      <span className="app-account-copy">
        <strong>&nbsp;</strong>
        <small>&nbsp;</small>
      </span>
    </div>
  );
}

export function AccountControl({ displayName, email }: AccountControlProps) {
  const pathname = usePathname();
  const active = pathname === "/settings" || pathname.startsWith("/settings/");
  const label = `${displayName}, Settings`;

  return (
    <Link
      className={`app-account ${active ? "app-account-active" : ""}`}
      href="/settings"
      aria-current={active ? "page" : undefined}
      aria-label={label}
    >
      <span className="app-account-avatar" aria-hidden="true">
        {initialsFromName(displayName)}
      </span>
      <span className="app-account-copy">
        <strong>{displayName}</strong>
        <small>{email}</small>
      </span>
    </Link>
  );
}
