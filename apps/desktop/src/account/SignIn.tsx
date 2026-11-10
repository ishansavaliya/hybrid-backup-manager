import { useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { Brand, Button, Card } from "@bakvion/ui";
import type { SignInParams } from "@bakvion/shared-types";

export function SignIn({
  error,
  onSignIn,
  onCancel,
}: {
  error: string;
  onSignIn: (p: SignInParams) => Promise<void>;
  onCancel?: () => void;
}) {
  const [method, setMethod] = useState<"password" | "code">("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const code = digits.join("");
  const ready =
    method === "password" ? !!username && !!password : code.length === 6;
  function setDigit(i: number, value: string) {
    const d = value.replace(/\D/g, "").slice(-1);
    setDigits((prev) => prev.map((v, j) => (j === i ? d : v)));
    if (d && i < 5) refs.current[i + 1]?.focus();
  }
  function paste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "");
    if (text.length !== 6) return;
    e.preventDefault();
    setDigits(text.split(""));
    refs.current[5]?.focus();
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      await onSignIn(
        method === "password"
          ? { method, username, password }
          : { method, code },
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="app-shell"
      style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}
    >
      <Card style={{ width: "min(420px, 92vw)" }}>
        <form className="stack" onSubmit={(e) => void submit(e)}>
          <Brand />
          <h1>Sign in</h1>
          <div className="row">
            <Button
              type="button"
              className={method === "password" ? "" : "secondary"}
              onClick={() => setMethod("password")}
            >
              Username
            </Button>
            <Button
              type="button"
              className={method === "code" ? "" : "secondary"}
              onClick={() => setMethod("code")}
            >
              6-digit code
            </Button>
          </div>
          {method === "password" ? (
            <>
              <label className="field">
                Username
                <input
                  value={username}
                  autoComplete="username"
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label className="field">
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            </>
          ) : (
            <div className="row code-boxes">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  className="code-box"
                  inputMode="numeric"
                  maxLength={1}
                  aria-label={`Digit ${i + 1}`}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onPaste={paste}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !digits[i] && i > 0)
                      refs.current[i - 1]?.focus();
                  }}
                />
              ))}
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <Button type="submit" disabled={!ready || busy}>
            Sign in
          </Button>
          {onCancel && (
            <Button type="button" className="secondary" onClick={onCancel}>
              Back
            </Button>
          )}
          <p className="muted" style={{ fontSize: 12 }}>
            No account? Contact your Bakvion provider.
          </p>
        </form>
      </Card>
    </div>
  );
}
