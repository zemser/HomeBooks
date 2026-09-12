export const WORKSPACE_MEMBER_ROLES = ["owner", "member"] as const;
export const WORKSPACE_INVITE_STATUSES = ["pending", "accepted", "declined", "revoked"] as const;

export type WorkspaceMemberRole = (typeof WORKSPACE_MEMBER_ROLES)[number];
export type WorkspaceInviteStatus = (typeof WORKSPACE_INVITE_STATUSES)[number];

export type WorkspaceMemberSettingsItem = {
  id: string;
  displayName: string;
  displayNameOverride: string | null;
  userDisplayName: string;
  email: string;
  isActive: boolean;
  role: WorkspaceMemberRole;
};

export type WorkspaceInviteItem = {
  id: string;
  invitedEmail: string;
  role: WorkspaceMemberRole;
  status: WorkspaceInviteStatus;
  workspaceName: string;
  invitedByDisplayName: string;
};

export type WorkspaceCategoryItem = {
  id: string;
  name: string;
};

export type WorkspaceSettingsSnapshot = {
  workspaceId: string;
  baseCurrency: string;
  canUpdateBaseCurrency: boolean;
  baseCurrencyLockReason: string | null;
};
