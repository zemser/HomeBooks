import type { Ref } from "react";

import type { ClassificationType } from "@/features/expenses/constants";
import {
  classificationAllowsPayer,
  classificationAllowsPersonalOwner,
  classificationAllowsRecipient,
} from "@/features/expenses/payer";
import type { WorkspaceMemberOption } from "@/features/expenses/types";

export type MemberAttributionFormValue = {
  personalOwnerMemberId: string;
  paidByMemberId: string;
  receivedByMemberId: string;
};

export function emptyMemberAttributionFormValue(): MemberAttributionFormValue {
  return {
    personalOwnerMemberId: "",
    paidByMemberId: "",
    receivedByMemberId: "",
  };
}

export function memberAttributionForClassificationType(
  classificationType: ClassificationType,
  current: MemberAttributionFormValue,
  accountOwnerMemberId = "",
): MemberAttributionFormValue {
  const accountOwner = accountOwnerMemberId || "";

  return {
    personalOwnerMemberId: classificationAllowsPersonalOwner(classificationType)
      ? current.personalOwnerMemberId || accountOwner
      : "",
    paidByMemberId: classificationAllowsPayer(classificationType)
      ? accountOwner || current.paidByMemberId
      : "",
    receivedByMemberId: classificationAllowsRecipient(classificationType)
      ? current.receivedByMemberId || accountOwner
      : "",
  };
}

export function MemberAttributionFields({
  classificationType,
  value,
  members,
  onChange,
  personalOwnerSelectRef,
  accountOwnerMemberId = null,
  accountOwnerLabel = null,
  lockPayerToAccount = false,
}: {
  classificationType: ClassificationType | "";
  value: MemberAttributionFormValue;
  members: WorkspaceMemberOption[];
  onChange: (value: MemberAttributionFormValue) => void;
  personalOwnerSelectRef?: Ref<HTMLSelectElement>;
  accountOwnerMemberId?: string | null;
  accountOwnerLabel?: string | null;
  lockPayerToAccount?: boolean;
}) {
  if (!classificationType || classificationType === "transfer" || classificationType === "ignore") {
    return null;
  }

  const showPersonalOwner = classificationAllowsPersonalOwner(classificationType);
  const showPaidBy = classificationAllowsPayer(classificationType) && !lockPayerToAccount;
  const showReceivedBy = classificationAllowsRecipient(classificationType) && !lockPayerToAccount;
  const ownerLabel = accountOwnerLabel
    ?? members.find((member) => member.id === accountOwnerMemberId)?.displayName
    ?? null;

  return (
    <>
      {showPersonalOwner ? (
        <label className="field">
          <span>Whose personal expense?</span>
          <select
            ref={personalOwnerSelectRef}
            className="input"
            value={value.personalOwnerMemberId}
            onChange={(event) =>
              onChange({ ...value, personalOwnerMemberId: event.target.value })
            }
          >
            {!accountOwnerMemberId ? (
              <option value="">{lockPayerToAccount ? "Each account owner" : "Unassigned"}</option>
            ) : null}
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </select>
          {lockPayerToAccount ? (
            <span className="helper-text">
              {ownerLabel
                ? `This account belongs to ${ownerLabel}. Change this only if the expense was for someone else.`
                : "Leave this as each account owner unless these expenses were for someone else."}
            </span>
          ) : null}
        </label>
      ) : null}

      {showPaidBy ? (
        <label className="field">
          <span>Paid by</span>
          <select
            className="input"
            value={value.paidByMemberId}
            onChange={(event) => onChange({ ...value, paidByMemberId: event.target.value })}
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showReceivedBy ? (
        <label className="field">
          <span>Received by</span>
          <select
            className="input"
            value={value.receivedByMemberId}
            onChange={(event) => onChange({ ...value, receivedByMemberId: event.target.value })}
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {lockPayerToAccount && !showPersonalOwner && classificationAllowsPayer(classificationType) ? (
        <p className="helper-text">
          {ownerLabel ? `Paid from ${ownerLabel}’s account.` : "Paid from each selected account."}
        </p>
      ) : null}

      {lockPayerToAccount && classificationAllowsRecipient(classificationType) ? (
        <p className="helper-text">
          {ownerLabel ? `Received into ${ownerLabel}’s account.` : "Received into each selected account."}
        </p>
      ) : null}
    </>
  );
}

export function SplitForSettlementField({
  classificationType,
  value,
  onChange,
  canSplit,
  warnWhenLeavingShared = false,
}: {
  classificationType: ClassificationType | "";
  value: boolean;
  onChange: (value: boolean) => void;
  canSplit: boolean;
  warnWhenLeavingShared?: boolean;
}) {
  if (warnWhenLeavingShared && classificationType && classificationType !== "shared") {
    return (
      <p className="helper-text">
        Changing this away from shared drops confirmed split tracking.
      </p>
    );
  }

  if (classificationType !== "shared" || !canSplit) {
    return null;
  }

  return (
    <label className="checkbox-label">
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        Split this later
        <small className="helper-text">
          Adds this to shared balances. Leave off for ordinary shared spending like rent or groceries.
        </small>
      </span>
    </label>
  );
}
