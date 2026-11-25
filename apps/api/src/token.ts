import { createHmac, timingSafeEqual } from "node:crypto";
import "./env";

function secret() {
  return process.env.JWT_SECRET || "dev-only-change-me";
}

export function signToken(userId: string) {
  const body = Buffer.from(
    JSON.stringify({
      sub: userId,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14,
    }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readToken(token: string): { sub: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const actual = Buffer.from(sig);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      sub?: unknown;
      exp?: unknown;
    };
    if (typeof payload.sub !== "string") return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}
