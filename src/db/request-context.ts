import { AsyncLocalStorage } from "node:async_hooks";

type DatabaseRequestContext = {
  currentUserId: string | null;
};

const databaseRequestContext = new AsyncLocalStorage<DatabaseRequestContext>();

export function getCurrentDatabaseUserId() {
  return databaseRequestContext.getStore()?.currentUserId ?? null;
}

export function setCurrentDatabaseUserId(currentUserId: string) {
  const existingContext = databaseRequestContext.getStore();

  if (existingContext) {
    existingContext.currentUserId = currentUserId;
    return;
  }

  databaseRequestContext.enterWith({ currentUserId });
}

export function clearCurrentDatabaseUserId() {
  const existingContext = databaseRequestContext.getStore();

  if (existingContext) {
    existingContext.currentUserId = null;
    return;
  }

  databaseRequestContext.enterWith({ currentUserId: null });
}

export async function runWithDatabaseUser<T>(
  currentUserId: string,
  callback: () => Promise<T>,
) {
  return databaseRequestContext.run({ currentUserId }, callback);
}
