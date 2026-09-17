"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function CreateUnitForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || undefined }),
    });

    setSubmitting(false);

    if (!res.ok) {
      setError("Could not create unit. Check the name and try again.");
      return;
    }

    setName("");
    setDescription("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">New unit</h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Unit name (e.g. Data Structures & Algorithms)"
        required
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create unit"}
      </button>
    </form>
  );
}
