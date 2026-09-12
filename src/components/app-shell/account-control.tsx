"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { signOutAction } from "@/features/auth/actions";

export type AccountControlProps = {
  displayName: string;
  email: string;
  canSignOut: boolean;
};

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function AccountControl({ displayName, email, canSignOut }: AccountControlProps) {
  const pathname = usePathname();
  const settingsActive = pathname === "/settings" || pathname.startsWith("/settings/");
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const buttonId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="app-account-wrap" ref={wrapRef}>
      <button
        className={`app-account ${open || settingsActive ? "app-account-active" : ""}`}
        type="button"
        id={buttonId}
        ref={buttonRef}
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${displayName}, account menu`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="app-account-avatar" aria-hidden="true">
          {initialsFromName(displayName)}
        </span>
        <span className="app-account-copy">
          <strong>{displayName}</strong>
          <small>{email}</small>
        </span>
      </button>
      {open ? (
        <div className="app-account-menu" id={menuId} aria-labelledby={buttonId}>
          <Link href="/settings" onClick={() => setOpen(false)}>
            Settings
          </Link>
          {canSignOut ? (
            <form action={signOutAction}>
              <button type="submit">Sign out</button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
