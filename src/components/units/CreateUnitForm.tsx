"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { buttonPrimary, FormError, inputClass } from "@/components/ui/form";

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
    <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-4 border-l-2 border-mark/35 pl-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="unit-name" className="text-sm font-medium text-foreground">
          Unit name
        </label>
        <input
          id="unit-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Data Structures and Algorithms"
          required
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="unit-description" className="text-sm font-medium text-foreground">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="unit-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Course code, lecturer, semester…"
          rows={2}
          className={inputClass}
        />
      </div>
      {error && <FormError>{error}</FormError>}
      <div>
        <button type="submit" disabled={submitting} className={buttonPrimary}>
          {submitting ? "Creating…" : "Create unit"}
        </button>
      </div>
    </form>
  );
}
