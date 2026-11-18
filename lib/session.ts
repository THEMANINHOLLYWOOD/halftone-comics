"use client";

// Signing in (only the admin needs to) with a one-time email link, and the
// session the studio's API calls carry. Everyone else never sees any of it.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";

export interface SessionState {
  email: string | null;
  token: string | null;
  admin: boolean;
}

const SIGNED_OUT: SessionState = { email: null, token: null, admin: false };
let state = SIGNED_OUT;
let client: SupabaseClient | null = null;
const listeners = new Set<() => void>();

function publish(next: SessionState) {
  state = next;
  for (const listener of listeners) listener();
}

export function supabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "implicit" } });
  return client;
}

async function check(token: string | null, email: string | null) {
  if (!token) {
    publish(SIGNED_OUT);
    return;
  }
  publish({ email, token, admin: state.token === token ? state.admin : false });
  try {
    const res = await fetch("/api/admin", { headers: { authorization: `Bearer ${token}` } });
    const body = (await res.json()) as { admin?: boolean };
    if (state.token === token) publish({ email, token, admin: !!body.admin });
  } catch {
    // Stays a plain signed-in visitor.
  }
}

let started = false;
function start() {
  if (started) return;
  started = true;
  const sb = supabase();
  if (!sb) return;
  void sb.auth.getSession().then(({ data }) => check(data.session?.access_token ?? null, data.session?.user.email ?? null));
  sb.auth.onAuthStateChange((_event, session) => void check(session?.access_token ?? null, session?.user.email ?? null));
}

/** The access token for API calls, when someone is signed in. */
export function accessToken(): string | null {
  return state.token;
}

export function useSession(): SessionState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      start();
      return () => listeners.delete(listener);
    },
    () => state,
    () => SIGNED_OUT,
  );
}

export async function sendSignInLink(email: string): Promise<void> {
  const sb = supabase();
  if (!sb) throw new Error("Signing in is not set up here.");
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut();
  publish(SIGNED_OUT);
}
