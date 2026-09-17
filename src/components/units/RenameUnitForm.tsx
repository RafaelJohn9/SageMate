"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RenameUnitForm({
  unitId,
  initialName,
  initialDescription,
}: {
  unitId: string;
  initialName: string;
  initialDescription: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/units/${unitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Could not save changes.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="self-start text-xs text-muted-foreground hover:underline"
      >
        Rename / edit description
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Description (optional)"
        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setName(initialName);
            setDescription(initialDescription ?? "");
            setError(null);
          }}
          className="rounded-md border border-border px-3 py-1 text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
