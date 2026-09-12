"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type FocusEvent } from "react";
import { useFormStatus } from "react-dom";

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

function AccountChip({
  displayName,
  email,
  showCaret = false,
}: {
  displayName: string;
  email: string;
  showCaret?: boolean;
}) {
  return (
    <>
      <span className="app-account-avatar" aria-hidden="true">
        {initialsFromName(displayName)}
      </span>
      <span className="app-account-copy">
        <strong>{displayName}</strong>
        <small>{email}</small>
      </span>
      {showCaret ? (
        <span className="app-account-caret" aria-hidden="true">
          <svg viewBox="0 0 12 12" width="12" height="12">
            <path
              d="M2.5 4.25 6 8.25 9.5 4.25"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </span>
      ) : null}
    </>
  );
}

function SignOutButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

export function AccountControlSkeleton() {
  return (
    <div className="app-account-wrap">
      <div className="app-account app-account-skeleton" aria-busy="true" aria-label="Account">
        <span className="app-account-avatar" />
        <span className="app-account-copy">
          <strong>&nbsp;</strong>
          <small>&nbsp;</small>
        </span>
      </div>
    </div>
  );
}

function AccountSettingsLink({ displayName, email }: Omit<AccountControlProps, "canSignOut">) {
  const pathname = usePathname();
  const settingsActive = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <div className="app-account-wrap">
      <Link
        className={`app-account ${settingsActive ? "app-account-active" : ""}`}
        href="/settings"
        aria-current={settingsActive ? "page" : undefined}
        aria-label={`${displayName}, Settings`}
      >
        <AccountChip displayName={displayName} email={email} />
      </Link>
    </div>
  );
}

function AccountMenu({ displayName, email }: Omit<AccountControlProps, "canSignOut">) {
  const pathname = usePathname();
  const settingsActive = pathname === "/settings" || pathname.startsWith("/settings/");
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const menuId = useId();
  const buttonId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== undefined) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

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

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && wrapRef.current?.contains(next)) return;

    if (blurTimeoutRef.current !== undefined) {
      window.clearTimeout(blurTimeoutRef.current);
    }
    blurTimeoutRef.current = window.setTimeout(() => {
      if (!wrapRef.current?.contains(document.activeElement)) {
        setOpen(false);
      }
    }, 0);
  }

  return (
    <div className="app-account-wrap" ref={wrapRef} onBlur={onBlur}>
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
        <AccountChip displayName={displayName} email={email} showCaret />
      </button>
      <div
        className="app-account-menu"
        id={menuId}
        data-open={open ? "true" : "false"}
        inert={!open}
        aria-label="Account"
      >
        <Link href="/settings" onClick={() => setOpen(false)}>
          Settings
        </Link>
        <form action={signOutAction}>
          <SignOutButton />
        </form>
      </div>
    </div>
  );
}

export function AccountControl({ displayName, email, canSignOut }: AccountControlProps) {
  if (!canSignOut) {
    return <AccountSettingsLink displayName={displayName} email={email} />;
  }

  return <AccountMenu displayName={displayName} email={email} />;
}
