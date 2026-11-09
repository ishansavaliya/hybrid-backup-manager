"use client";

import { useActionState } from "react";
import { Button } from "@bakvion/ui";
import { loginAction, type LoginState } from "../auth-actions";

const initial: LoginState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="stack">
      {state.error ? <div className="error">{state.error}</div> : null}
      <label className="field">
        Username
        <input name="username" autoComplete="username" required />
      </label>
      <label className="field">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <Button type="submit" disabled={pending}>
        Sign in
      </Button>
    </form>
  );
}
