import type { ErrorPayload } from "@tabletop-judge/shared";

export class RoomError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function toErrorPayload(err: unknown): ErrorPayload {
  if (err instanceof RoomError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof Error) {
    return { code: "INTERNAL_ERROR", message: err.message };
  }
  return { code: "INTERNAL_ERROR", message: "Something went wrong." };
}
