import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeInviteEmail } from "../../src/features/workspaces/invites";

const membersPath = new URL("../../src/features/workspaces/members.ts", import.meta.url);
const invitesPath = new URL("../../src/features/workspaces/invites.ts", import.meta.url);
const contextPath = new URL("../../src/features/workspaces/current-context.ts", import.meta.url);
const migrationPath = new URL("../../src/db/migrations/0014_plain_grim_reaper.sql", import.meta.url);
const membersRoutePath = new URL("../../src/app/api/workspace-members/route.ts", import.meta.url);

test("invite emails are normalized and reject placeholders", () => {
  assert.equal(normalizeInviteEmail("  Alex@Example.COM "), "alex@example.com");
  assert.throws(() => normalizeInviteEmail("not-an-email"), /valid email/);
  assert.throws(
    () => normalizeInviteEmail("member-1@placeholder.finapp.local"),
    /real email/,
  );
});

test("workspaces no longer create fake placeholder members", async () => {
  const [membersSource, routeSource] = await Promise.all([
    readFile(membersPath, "utf8"),
    readFile(membersRoutePath, "utf8"),
  ]);

  assert.doesNotMatch(membersSource, /placeholder\.finapp\.local/);
  assert.doesNotMatch(membersSource, /createWorkspaceMember/);
  assert.doesNotMatch(routeSource, /export async function POST/);
});

test("accepting an invite does not close invites to other workspaces", async () => {
  const source = await readFile(invitesPath, "utf8");
  const acceptStart = source.indexOf("export async function acceptWorkspaceInvite");
  const declineStart = source.indexOf("export async function declineWorkspaceInvite");

  assert.notEqual(acceptStart, -1);
  assert.notEqual(declineStart, -1);

  const acceptSource = source.slice(acceptStart, declineStart);
  assert.doesNotMatch(acceptSource, /declined/);
  assert.doesNotMatch(acceptSource, /already belong to a household/);
});

test("current workspace prefers the most recently joined membership", async () => {
  const source = await readFile(contextPath, "utf8");

  assert.match(source, /async function findCurrentMembership/);
  assert.match(source, /orderBy\(desc\(workspaceMembers\.createdAt\)\)/);
  assert.doesNotMatch(source, /workspaceMembers\.updatedAt/);
});

test("invite RLS helpers stay in the private app schema", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /CREATE TABLE "workspace_invites"/);
  assert.equal((migration.match(/SECURITY DEFINER/g) ?? []).length, 2);
  assert.equal((migration.match(/SET search_path = public, pg_temp/g) ?? []).length, 2);
  assert.match(migration, /CREATE OR REPLACE FUNCTION "app"\."workspace_has_members"/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION "app"\."has_pending_workspace_invite"/);
  assert.match(migration, /"app"\."has_pending_workspace_invite"\("workspace_id"\)/);
  assert.match(migration, /NOT "app"\."workspace_has_members"\("workspace_id"\)/);
  assert.match(migration, /CREATE POLICY "workspace_invites_select_member_or_invitee"/);
  assert.match(migration, /CREATE POLICY "workspace_invites_insert_owner"/);
  assert.match(
    migration,
    /"user_id" = "app"\."current_user_id"\(\)\s+AND "role" = 'member'\s+AND "app"\."has_pending_workspace_invite"/,
  );
  assert.match(migration, /AND "role" = 'member'\s+AND "status" = 'pending'/);
});
