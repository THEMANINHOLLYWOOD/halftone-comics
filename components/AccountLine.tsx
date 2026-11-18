"use client";

import { useState } from "react";
import { sendSignInLink, signOut, useSession } from "@/lib/session";

const quiet = "font-mono text-[10.5px] uppercase tracking-[0.16em]";

/** A quiet line at the foot of the index: sign in (the admin does), or who is signed in. */
export function AccountLine() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | string>("idle");

  if (session.email) {
    return (
      <p className={`${quiet} flex items-center justify-center gap-3 text-mute`}>
        <span>{session.admin ? "Admin" : "Signed in"}</span>
        <button type="button" onClick={() => void signOut()} className="h-11 px-2 hover:text-ink">
          Sign out
        </button>
      </p>
    );
  }
  if (!open) {
    return (
      <p className="flex justify-center">
        <button type="button" onClick={() => setOpen(true)} className={`${quiet} h-11 px-3 text-mute hover:text-ink`}>
          Sign in
        </button>
      </p>
    );
  }
  return (
    <form
      className="mx-auto flex w-full max-w-sm items-center gap-1.5 rounded-full bg-paper p-1.5 ring-1 ring-line"
      onSubmit={(event) => {
        event.preventDefault();
        if (!email.includes("@")) return;
        setState("sending");
        sendSignInLink(email.trim())
          .then(() => setState("sent"))
          .catch((error: Error) => setState(error.message));
      }}
    >
      {state === "sent" ? (
        <p className="h-10 flex-1 px-3 text-[13px] leading-10">Check your email for the sign-in link.</p>
      ) : (
        <>
          <input
            type="email"
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            aria-label="Email"
            data-keep-paste
            className="h-10 min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-mute sm:text-[14px]"
          />
          <button type="submit" disabled={state === "sending"} className="h-10 rounded-full bg-ink px-4 font-mono text-[10.5px] uppercase tracking-[0.14em] text-paper disabled:opacity-40">
            Send link
          </button>
        </>
      )}
      {state !== "idle" && state !== "sending" && state !== "sent" && <p className="px-3 text-[12px] text-accent">{state}</p>}
    </form>
  );
}
