"use client";

import { useEffect } from "react";

type AuthAutofocusProps = {
  target: "email" | "google";
};

export function AuthAutofocus({ target }: AuthAutofocusProps) {
  useEffect(() => {
    const focusTarget = () => {
      const selector = target === "google" ? ".google-button" : 'input[name="email"]';
      document.querySelector<HTMLElement>(selector)?.focus();
    };

    focusTarget();
    const frame = requestAnimationFrame(focusTarget);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return null;
}
