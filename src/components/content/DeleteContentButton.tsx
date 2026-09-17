"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteContentButton({ contentId }: { contentId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this content item? Question sets already generated from it are unaffected.")) {
      return;
    }
    setDeleting(true);
    await fetch(`/api/content/${contentId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="text-xs text-danger hover:underline disabled:opacity-50"
    >
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );
}
