import { useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import type { SignInParams } from "@bakvion/shared-types";
import { format, useI18n } from "../i18n";
import { Button, Field, Input, Notice, PasswordInput, Segmented } from "../ui";
import { LanguageSwitch } from "../LanguageSwitch";
import { ExpertDialog } from "./ExpertDialog";

export function SignIn({
  error,
  onSignIn,
  onCancel,
}: {
  error: string;
  onSignIn: (p: SignInParams) => Promise<void>;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const s = t.signin;
  const [method, setMethod] = useState<"password" | "code">("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const [expert, setExpert] = useState(false);
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
    if (text.length < 6) return;
    e.preventDefault();
    setDigits(text.slice(0, 6).split(""));
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
    <div className="gx-signin">
      <form className="gx-signin__card" onSubmit={(e) => void submit(e)}>
        <div className="gx-signin__top">
          <span className="gx-signin__brand">
            <span className="gx-logo" aria-hidden="true" />
            Bakvion
          </span>
          <LanguageSwitch />
        </div>
        <div>
          <h1 className="gx-signin__title">{s.title}</h1>
          <p className="gx-muted">{s.subtitle}</p>
        </div>
        <Segmented
          label={s.title}
          value={method}
          onChange={setMethod}
          options={[
            { key: "password", label: s.username },
            { key: "code", label: s.code },
          ]}
        />
        {method === "password" ? (
          <>
            <Field label={s.username} htmlFor="si-user">
              <Input
                id="si-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
              />
            </Field>
            <Field label={s.password} htmlFor="si-pass">
              <PasswordInput
                id="si-pass"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                showLabel={s.showPassword}
                hideLabel={s.hidePassword}
              />
            </Field>
          </>
        ) : (
          <div className="gx-digits">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className="gx-digit"
                inputMode="numeric"
                maxLength={1}
                aria-label={format(s.digit, { n: i + 1 })}
                value={d}
                autoFocus={i === 0}
                onChange={(e) => setDigit(i, e.target.value)}
                onPaste={paste}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !d && i > 0)
                    refs.current[i - 1]?.focus();
                }}
              />
            ))}
          </div>
        )}
        {error ? <Notice kind="error">{error}</Notice> : null}
        <Button
          type="submit"
          disabled={!ready || busy}
          className="gx-btn--block"
        >
          {busy ? s.signingIn : s.submit}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            <ArrowLeft size={16} aria-hidden="true" />
            {t.common.back}
          </Button>
        ) : null}
        <div className="gx-signin__expert">
          <span className="gx-muted">{s.noAccount}</span>
          <Button variant="secondary" onClick={() => setExpert(true)}>
            {s.expert}
          </Button>
        </div>
      </form>
      <ExpertDialog open={expert} onOpenChange={setExpert} />
    </div>
  );
}
