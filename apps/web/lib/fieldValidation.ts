import { z } from "zod";

export function validateWithSchema(schema: z.ZodTypeAny, value: unknown): string | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? "Invalid value.";
}

export function validateIntInput(
  raw: string,
  options: {
    required?: boolean;
    requiredMessage?: string;
    min: number;
    max: number;
    rangeMessage: string;
    intMessage?: string;
  },
): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return options.required ? (options.requiredMessage ?? "This field is required.") : null;
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return options.intMessage ?? "Enter a whole number.";
  }
  if (num < options.min || num > options.max) {
    return options.rangeMessage;
  }
  return null;
}

export function validateMoneyInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return "Amount is required.";
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return "Enter an amount.";
  if (num <= 0) return "Amount must be greater than zero.";
  if (num > 1_000_000_000) return "Amount is too large.";
  if (Math.abs(num * 100 - Math.round(num * 100)) >= 0.001) {
    return "Use at most two decimal places.";
  }
  return null;
}

export function validateDateInput(raw: string, required = false, requiredMessage = "Date is required."): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return required ? requiredMessage : null;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? null : "Use a date as YYYY-MM-DD.";
}

export function validateTimeInput(raw: string, required = false, requiredMessage = "Time is required."): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return required ? requiredMessage : null;
  }
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed.slice(0, 5)) ? null : "Use a time as HH:mm.";
}
