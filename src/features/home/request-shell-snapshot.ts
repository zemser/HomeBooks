import "server-only";

import { cache } from "react";

import { getAppShellSnapshot } from "@/features/home/service";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";

export const getRequestShellSnapshot = cache(() =>
  withCurrentWorkspaceDb((context, db) => getAppShellSnapshot(context, db)),
);
