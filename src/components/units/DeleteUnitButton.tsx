"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteUnitButton({ unitId }: { unitId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this unit and all its content, question sets, and answers?")) {
      return;
    }
    setDeleting(true);
    await fetch(`/api/units/${unitId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="text-sm text-red-600 hover:underline disabled:opacity-50"
    >
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );
}
