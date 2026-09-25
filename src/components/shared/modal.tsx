"use client";

import { useId } from "react";
import { Dialog } from "react-aria-components/Dialog";
import { Modal as AriaModal, ModalOverlay } from "react-aria-components/Modal";

type ModalProps = {
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: "default" | "wide";
  placement?: "center" | "sheet";
  allowContentOverflow?: boolean;
};

export function Modal({
  title,
  description,
  open,
  onClose,
  children,
  size = "default",
  placement = "center",
  allowContentOverflow = false,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <ModalOverlay
      className={`app-modal-overlay ${placement === "sheet" ? "app-modal-overlay-sheet" : ""}`}
      isOpen={open}
      isDismissable={placement === "sheet"}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <AriaModal
        className={`modal ${size === "wide" ? "modal-wide" : ""} ${placement === "sheet" ? "modal-sheet" : ""} ${allowContentOverflow ? "modal-overflow-visible" : ""}`}
      >
        <Dialog
          className="modal-content"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
        >
          <div className="page-actions">
            <div>
              <h2 id={titleId}>{title}</h2>
              {description ? (
                <p className="muted-text" id={descriptionId}>
                  {description}
                </p>
              ) : null}
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {children}
        </Dialog>
      </AriaModal>
    </ModalOverlay>
  );
}
