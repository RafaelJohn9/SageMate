"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonPrimary, buttonSecondary, FormError, inputClass } from "@/components/ui/form";

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
    <div className="mt-2 flex max-w-lg flex-col gap-3 border-l-2 border-mark/35 pl-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`rename-${unitId}`} className="text-sm font-medium text-foreground">
          Unit name
        </label>
        <input
          id={`rename-${unitId}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`describe-${unitId}`} className="text-sm font-medium text-foreground">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id={`describe-${unitId}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={inputClass}
        />
      </div>
      {error && <FormError>{error}</FormError>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={saving} className={buttonPrimary}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setName(initialName);
            setDescription(initialDescription ?? "");
            setError(null);
          }}
          className={buttonSecondary}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
