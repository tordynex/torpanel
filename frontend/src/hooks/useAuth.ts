// src/hooks/useAuth.ts
import { useMemo } from "react";

type JwtPayload = {
  sub?: string;
  username?: string;
  role?: "owner" | "workshop_user" | string;
  exp?: number; // seconds since epoch
  [k: string]: unknown;
};

function safeParseJwt(token: string): JwtPayload | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    // base64url -> base64
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isExpired(payload: JwtPayload | null) {
  if (!payload?.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now;
}

export function useAuth() {
  const value = useMemo(() => {
    const token = localStorage.getItem("token");
    if (!token) return null;

    const payload = safeParseJwt(token);
    if (!payload || isExpired(payload)) return null;

    return {
      id: payload.sub as string | undefined,
      username: payload.username as string | undefined,
      role: payload.role as string | undefined,
      token,
      payload,
    };
  }, []);

  return value; // null = inte inloggad/ogiltig token
}
