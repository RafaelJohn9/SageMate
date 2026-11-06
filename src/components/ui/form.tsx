import type { ReactNode } from "react";

// Shared building blocks for the worksheet-style forms: ruled sections with the label and hint in a
// left column and the controls on the right.

export const inputClass =
  "w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground";
export const buttonPrimary =
  "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50";
export const buttonSecondary =
  "rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50";

export function FormSection({
  title,
  hint,
  htmlFor,
  children,
}: {
  title: string;
  hint?: string;
  /** Pass the id of the single control this section labels; otherwise the section is a labelled group. */
  htmlFor?: string;
  children: ReactNode;
}) {
  const titleId = htmlFor ? undefined : `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div
      role={htmlFor ? undefined : "group"}
      aria-labelledby={titleId}
      className="grid gap-x-8 gap-y-3 border-b border-border py-5 last:border-b-0 md:grid-cols-[11rem_minmax(0,1fr)]"
    >
      <div>
        {htmlFor ? (
          <label htmlFor={htmlFor} className="font-display text-base font-semibold tracking-tight text-foreground">
            {title}
          </label>
        ) : (
          <p id={titleId} className="font-display text-base font-semibold tracking-tight text-foreground">
            {title}
          </p>
        )}
        {hint && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const optionBase =
  "block rounded-[3px] px-3 py-1.5 text-sm text-muted-foreground transition-colors peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary hover:text-foreground peer-checked:hover:text-primary-foreground";

/** Pick exactly one option. Built on real radio inputs, so arrow-key navigation works natively. */
export function Segmented<T extends string>({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-md border border-border bg-card p-0.5">
      {options.map((option) => (
        <label key={option.value} className="relative cursor-pointer">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="peer sr-only"
          />
          <span className={optionBase}>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

/** One of several options that can be switched on together, shown as a chip. */
export function ChipToggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className="relative cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        className={`${optionBase} border border-border bg-card peer-checked:border-primary`}
      >
        {children}
      </span>
    </label>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  );
}
