import { getRequestShellSnapshot } from "@/features/home/request-shell-snapshot";

export async function ReviewQueueBadge() {
  const snapshot = await getRequestShellSnapshot();

  if (snapshot.reviewQueueCount === 0) return null;

  return (
    <span
      className="nav-badge nav-badge-warning"
      aria-label={`${snapshot.reviewQueueCount} transactions pending review`}
    >
      <span aria-hidden="true">{snapshot.reviewQueueCount}</span>
    </span>
  );
}
