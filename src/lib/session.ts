"use client";

import { v4 as uuidv4 } from "uuid";

// V1's stand-in for a user_id: a random id generated once per browser and
// kept in localStorage. No login, no server-issued cookie -- clearing site
// data starts a fresh "user". When V1 gains accounts, this is the value a
// migration would map onto a real user_id.
const STORAGE_KEY = "tastemaker_session_id";

export function getSessionId(): string {
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const created = uuidv4();
  window.localStorage.setItem(STORAGE_KEY, created);
  return created;
}
