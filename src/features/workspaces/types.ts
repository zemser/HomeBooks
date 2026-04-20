export const WORKSPACE_MEMBER_ROLES = ["owner", "member"] as const;

export type WorkspaceMemberRole = (typeof WORKSPACE_MEMBER_ROLES)[number];

export type WorkspaceMemberSettingsItem = {
  id: string;
  displayName: string;
  displayNameOverride: string | null;
  userDisplayName: string;
  isActive: boolean;
  role: WorkspaceMemberRole;
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
