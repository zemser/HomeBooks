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
  fallbackPaidByMemberId = "",
): MemberAttributionFormValue {
  return {
    personalOwnerMemberId: classificationAllowsPersonalOwner(classificationType)
      ? current.personalOwnerMemberId
      : "",
    paidByMemberId: classificationAllowsPayer(classificationType)
      ? current.paidByMemberId || fallbackPaidByMemberId
      : "",
    receivedByMemberId: classificationAllowsRecipient(classificationType)
      ? current.receivedByMemberId
      : "",
  };
}

export function MemberAttributionFields({
  classificationType,
  value,
  members,
  onChange,
  personalOwnerSelectRef,
}: {
  classificationType: ClassificationType | "";
  value: MemberAttributionFormValue;
  members: WorkspaceMemberOption[];
  onChange: (value: MemberAttributionFormValue) => void;
  personalOwnerSelectRef?: Ref<HTMLSelectElement>;
}) {
  if (!classificationType || classificationType === "transfer" || classificationType === "ignore") {
    return null;
  }

  return (
    <>
      {classificationAllowsPersonalOwner(classificationType) ? (
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
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {classificationAllowsPayer(classificationType) ? (
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

      {classificationAllowsRecipient(classificationType) ? (
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
    </>
  );
}
