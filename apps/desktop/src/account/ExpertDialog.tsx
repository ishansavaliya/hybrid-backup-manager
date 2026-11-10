import { useState, type FormEvent } from "react";
import { CircleCheck } from "lucide-react";
import { GxDialog } from "@bakvion/ui/gx";
import { request } from "../api";
import { useI18n } from "../i18n";
import { Button, Field, Input, Notice } from "../ui";
import { errorText, toAppError } from "./messages";

/** "Connect with Bakvion experts": sends an enquiry through the service. */
export function ExpertDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const x = t.expert;
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    setBusy(true);
    setError("");
    try {
      await request("submitLead", {
        name: String(data.name ?? ""),
        business: String(data.business ?? ""),
        phone: String(data.phone ?? ""),
        email: String(data.email ?? ""),
        city: String(data.city ?? ""),
        pcs: data.pcs ? Number(data.pcs) : 0,
        message: String(data.message ?? ""),
      });
      setSent(true);
    } catch (err) {
      const ae = toAppError(err);
      setError(ae.code === "BAD_REQUEST" ? x.badFields : errorText(t, ae));
    } finally {
      setBusy(false);
    }
  }

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setSent(false);
      setError("");
    }
  }

  return (
    <GxDialog
      open={open}
      onOpenChange={close}
      title={sent ? x.thanksTitle : x.title}
      description={sent ? x.thanksBody : x.subtitle}
      closeLabel={t.common.close}
    >
      {sent ? (
        <>
          <div className="gx-dialog__body">
            <div className="gx-empty" role="status">
              <div className="gx-empty__icon" aria-hidden="true">
                <CircleCheck size={22} />
              </div>
              <p className="gx-empty__desc">{x.thanksClose}</p>
            </div>
          </div>
          <footer className="gx-dialog__foot">
            <Button onClick={() => close(false)}>{t.common.close}</Button>
          </footer>
        </>
      ) : (
        <form className="gx-dialog__form" onSubmit={(e) => void submit(e)}>
          <div className="gx-dialog__body">
            {error ? <Notice kind="error">{error}</Notice> : null}
            <div className="gx-grid-2">
              <Field label={x.name} htmlFor="ex-name">
                <Input
                  id="ex-name"
                  name="name"
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                />
              </Field>
              <Field label={x.business} htmlFor="ex-business">
                <Input
                  id="ex-business"
                  name="business"
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="organization"
                />
              </Field>
              <Field label={x.phone} htmlFor="ex-phone">
                <Input
                  id="ex-phone"
                  name="phone"
                  type="tel"
                  required
                  pattern="[0-9+\-\s()]{10,20}"
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                />
              </Field>
              <Field label={x.email} htmlFor="ex-email">
                <Input
                  id="ex-email"
                  name="email"
                  type="email"
                  maxLength={160}
                  autoComplete="email"
                />
              </Field>
              <Field label={x.city} htmlFor="ex-city">
                <Input id="ex-city" name="city" maxLength={80} />
              </Field>
              <Field label={x.pcs} htmlFor="ex-pcs">
                <Input id="ex-pcs" name="pcs" type="number" min={1} max={100} />
              </Field>
              <Field
                label={x.message}
                htmlFor="ex-message"
                className="gx-grid-2__full"
              >
                <textarea
                  id="ex-message"
                  name="message"
                  rows={3}
                  maxLength={1000}
                  className="gx-textarea"
                />
              </Field>
            </div>
          </div>
          <footer className="gx-dialog__foot">
            <Button variant="secondary" onClick={() => close(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? x.sending : x.send}
            </Button>
          </footer>
        </form>
      )}
    </GxDialog>
  );
}
