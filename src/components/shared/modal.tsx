"use client";

import { useEffect, useId, useRef } from "react";

type ModalProps = {
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: "default" | "wide";
};

export function Modal({ title, description, open, onClose, children, size = "default" }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      className={`modal ${size === "wide" ? "modal-wide" : ""}`}
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <div className="modal-content">
        <div className="page-actions">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p className="muted-text" id={descriptionId}>{description}</p> : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
