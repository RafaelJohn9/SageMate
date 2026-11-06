"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const POLL_MS = 3000;

export function GenerationStatus({
  status,
  error,
  isRevision,
  retryHref,
}: {
  status: "PENDING" | "FAILED";
  error: string | null;
  isRevision: boolean;
  retryHref: string;
}) {
  const router = useRouter();

  // Re-run the server component until the set finishes. Skipped while the tab is hidden.
  useEffect(() => {
    if (status !== "PENDING") return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status, router]);

  if (status === "FAILED") {
    return (
      <div role="alert" className="flex flex-col gap-3 border-l-2 border-danger pl-5">
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
          This set could not be created
        </h2>
        {error && <p className="max-w-xl text-sm text-muted-foreground">{error}</p>}
        <div>
          <Link
            href={retryHref}
            className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div role="status" className="flex flex-col gap-3 border-l-2 border-mark/35 pl-5">
      <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
        {isRevision ? "Writing your questions and answers" : "Writing your questions"}
      </h2>
      <div className="writing-bar h-2 w-full max-w-xs overflow-hidden rounded-full bg-border" aria-hidden>
        <span className="block h-full w-1/3 rounded-full bg-highlight" />
      </div>
      <p className="max-w-xl text-sm text-muted-foreground">
        {isRevision
          ? "Revision sets are written in parts, so this can take a few minutes. "
          : "This usually takes under a minute. "}
        You can leave this page: the set keeps generating and will appear in your unit when it is done.
      </p>
    </div>
  );
}
