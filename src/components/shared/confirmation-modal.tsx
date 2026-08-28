"use client";

import { Modal } from "@/components/shared/modal";

type ConfirmationModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  confirmDisabled = false,
  onClose,
  onConfirm,
}: ConfirmationModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      <div className="action-row modal-actions-end">
        <button className="button button-secondary" type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button button-danger"
          type="button"
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
