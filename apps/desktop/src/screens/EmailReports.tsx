import { useEffect, useState } from "react";
import { Mail, Plus, Send, X } from "lucide-react";
import { request } from "../api";
import { format, useI18n } from "../i18n";
import { Button, Card, CardHeader, Field, Input, Segmented } from "../ui";

type Mode = "all" | "failures" | "off";
interface ReportSettings {
  emails: string[];
  mode: Mode;
}

const MAX = 3;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailReports({
  signedIn,
  busy,
  act,
  notify,
}: {
  signedIn: boolean;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
  notify: (m: string) => void;
}) {
  const { t } = useI18n();
  const s = t.settings;
  const [mode, setMode] = useState<Mode>("all");
  const [emails, setEmails] = useState<string[]>([""]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    request<ReportSettings>("reportSettings")
      .then((r) => {
        if (!live) return;
        setMode(r.mode);
        setEmails(r.emails.length ? r.emails : [""]);
        setLoaded(true);
      })
      .catch(() => {
        /* no service: the card stays disabled */
      });
    return () => {
      live = false;
    };
  }, []);

  const filled = emails.map((e) => e.trim()).filter(Boolean);
  const valid = filled.every((e) => EMAIL.test(e));
  const save = () =>
    request<ReportSettings>("setReportSettings", { emails: filled, mode });

  return (
    <Card>
      <CardHeader title={s.reportsTitle} description={s.reportsBody} />
      <div className="gx-form">
        <Field label={s.reportsWhen} htmlFor="st-report-mode">
          <div id="st-report-mode">
            <Segmented<Mode>
              label={s.reportsWhen}
              value={mode}
              onChange={setMode}
              options={[
                { key: "all", label: s.modeAll },
                { key: "failures", label: s.modeFailures },
                { key: "off", label: s.modeOff },
              ]}
            />
          </div>
        </Field>
        {emails.map((value, i) => {
          const label = format(s.reportsEmail, { n: i + 1 });
          const bad = !!value.trim() && !EMAIL.test(value.trim());
          return (
            <Field
              key={i}
              label={label}
              htmlFor={`st-report-email-${i}`}
              hint={bad ? s.reportsInvalid : undefined}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <Input
                  id={`st-report-email-${i}`}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="owner@business.in"
                  value={value}
                  aria-invalid={bad || undefined}
                  maxLength={160}
                  onChange={(e) =>
                    setEmails(
                      emails.map((x, j) => (j === i ? e.target.value : x)),
                    )
                  }
                />
                {emails.length > 1 ? (
                  <button
                    type="button"
                    className="gx-btn gx-btn--ghost gx-btn--icon"
                    aria-label={`${t.common.remove} ${label}`}
                    onClick={() => setEmails(emails.filter((_, j) => j !== i))}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </Field>
          );
        })}
        {emails.length < MAX ? (
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEmails([...emails, ""])}
            >
              <Plus size={14} aria-hidden="true" />
              {s.reportsAdd}
            </Button>
          </div>
        ) : null}
        <p className="gx-hint" style={{ margin: 0, display: "flex", gap: 8 }}>
          <Mail size={14} aria-hidden="true" style={{ flex: "none" }} />
          {s.reportsHint}
        </p>
        <div className="gx-form__actions">
          <Button
            variant="secondary"
            disabled={busy || !loaded || !signedIn || !valid || !filled.length}
            onClick={() =>
              void act(async () => {
                await save();
                await request("sendTestReport");
                notify(
                  format(s.reportsTestSent, { emails: filled.join(", ") }),
                );
              })
            }
          >
            <Send size={14} aria-hidden="true" />
            {s.reportsTest}
          </Button>
          <Button
            disabled={busy || !loaded || !valid}
            onClick={() =>
              void act(async () => {
                const r = await save();
                setEmails(r.emails.length ? r.emails : [""]);
                notify(s.reportsSaved);
              })
            }
          >
            {s.reportsSave}
          </Button>
        </div>
      </div>
    </Card>
  );
}
