"use client";

import { useState, type FormEvent } from "react";
import type { Messages } from "@bakvion/i18n";

type Field = "name" | "business" | "phone" | "email" | "pcs" | "message";

/** "Talk to a Bakvion expert" — posts to /api/v1/leads. */
export function EnquiryForm({ t }: { t: Messages["expert"] }) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [bad, setBad] = useState<Partial<Record<Field, true>>>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setState("sending");
    setError(null);
    setBad({});
    try {
      const res = await fetch("/api/v1/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, source: "website" }),
      });
      if (res.ok) {
        setState("done");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        fields?: Partial<Record<Field, string>>;
      };
      if (res.status === 400) {
        setBad(
          Object.fromEntries(
            Object.keys(body.fields ?? {}).map((k) => [k, true]),
          ) as Partial<Record<Field, true>>,
        );
        setError(t.errFields);
      } else if (res.status === 429) setError(t.errRate);
      else setError(t.errGeneric);
    } catch {
      setError(t.errOffline);
    }
    setState("idle");
  }

  if (state === "done")
    return (
      <div className="site-thanks" role="status">
        <span className="site-thanks__icon" aria-hidden="true">
          ✓
        </span>
        <h3>{t.thanksTitle}</h3>
        <p>{t.thanksBody}</p>
      </div>
    );

  const opt = <span className="site-opt">({t.optional})</span>;
  return (
    <form className="site-form" onSubmit={onSubmit} noValidate={false}>
      {error ? (
        <p className="site-form__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="site-form__grid">
        <label>
          <span>{t.name}</span>
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            aria-invalid={bad.name}
          />
        </label>
        <label>
          <span>{t.business}</span>
          <input
            name="business"
            required
            minLength={2}
            maxLength={120}
            autoComplete="organization"
            aria-invalid={bad.business}
          />
        </label>
        <label>
          <span>{t.phone}</span>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            required
            pattern="[0-9+\-\s()]{10,20}"
            placeholder={t.phonePlaceholder}
            autoComplete="tel"
            aria-invalid={bad.phone}
          />
        </label>
        <label>
          <span>
            {t.email} {opt}
          </span>
          <input
            name="email"
            type="email"
            maxLength={160}
            autoComplete="email"
            aria-invalid={bad.email}
          />
        </label>
        <label>
          <span>
            {t.city} {opt}
          </span>
          <input name="city" maxLength={80} autoComplete="address-level2" />
        </label>
        <label>
          <span>
            {t.pcs} {opt}
          </span>
          <input
            name="pcs"
            type="number"
            min={1}
            max={100}
            inputMode="numeric"
            aria-invalid={bad.pcs}
          />
        </label>
        <label className="site-form__full">
          <span>
            {t.message} {opt}
          </span>
          <textarea
            name="message"
            rows={3}
            maxLength={1000}
            aria-invalid={bad.message}
          />
        </label>
        {/* Honeypot: hidden from people, bots fill it in. */}
        <label className="site-hp" aria-hidden="true">
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <button
        type="submit"
        className="site-btn site-btn--primary"
        disabled={state === "sending"}
      >
        {state === "sending" ? t.sending : t.send}
      </button>
    </form>
  );
}
