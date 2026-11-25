import type { ZodType } from "zod";

type HttpStatus = 400 | 401 | 403 | 404 | 409 | 500;

export class HttpError extends Error {
  status: HttpStatus;

  constructor(status: HttpStatus, message: string) {
    super(message);
    this.status = status;
  }
}

export function parseBody<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(" ");
    throw new HttpError(400, message || "Check the form and try again.");
  }
  return result.data;
}
