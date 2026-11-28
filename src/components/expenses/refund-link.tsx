"use client";

import { useState } from "react";

type Candidate = {
  id: string;
  date: string;
  description: string;
  currency: string;
  amount: string;
};

export function RefundLink({ creditId }: { creditId: string }) {
  const [items, setItems] = useState<Candidate[] | null>(null);
  const [purchase, setPurchase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (!items) {
        const response = await fetch(
          "/api/refunds?credit=" + encodeURIComponent(creditId),
        );
        if (!response.ok) throw new Error("Could not load purchases.");
        setItems(await response.json());
      } else {
        const response = await fetch("/api/refunds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creditId, purchaseId: purchase }),
        });
        if (!response.ok) throw new Error((await response.json()).error);
        window.location.reload();
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not link the refund.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      {items && (
        <label>
          Original purchase{" "}
          <select
            value={purchase}
            onChange={(event) => setPurchase(event.target.value)}
          >
            <option value="">Select a purchase</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.date} · {item.description} · {item.currency} {item.amount}
              </option>
            ))}
          </select>
        </label>
      )}
      {items?.length === 0 ? (
        <p>No matching purchases on this account.</p>
      ) : (
        <button
          type="button"
          disabled={busy || (!!items && !purchase)}
          onClick={submit}
        >
          {items
            ? "Use this purchase’s FX value"
            : "Link refund to original purchase"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
