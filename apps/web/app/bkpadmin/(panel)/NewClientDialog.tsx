"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { createClientFormAction, type FormState } from "../actions";
import { Button, Dialog, Field, Input, Notice, Stepper, Textarea } from "../ui";

/** `YYYY-MM-DD` in India time, `months` from today. */
function istDatePlus(months: number): string {
  const ist = new Date(Date.now() + 330 * 60_000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(y, m, Math.min(ist.getUTCDate(), lastDay)));
  return d.toISOString().slice(0, 10);
}

const QUICK = [
  { label: "1 month", months: 1 },
  { label: "3 months", months: 3 },
  { label: "6 months", months: 6 },
  { label: "1 year", months: 12 },
];

export interface ClientPrefill {
  leadId: string;
  name: string;
  contactPerson: string;
  phone: string;
  notes: string;
}

export function NewClientDialog({ prefill }: { prefill?: ClientPrefill }) {
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(params.get("new") === "1");
  const [state, action, pending] = useActionState<FormState, FormData>(
    createClientFormAction,
    { error: null },
  );
  const dateRef = useRef<HTMLInputElement>(null);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next && params.get("new") === "1") router.replace("/bkpadmin");
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden="true" />
        New client
      </Button>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="New client"
        description="Create the business account. You can set the login and send a 6-digit code next."
      >
        <form action={action} className="gx-dialog__form">
          {prefill ? (
            <input type="hidden" name="leadId" value={prefill.leadId} />
          ) : null}
          <div className="gx-dialog__body">
            {state.error ? (
              <Notice error={state.error} variant="inline" />
            ) : null}
            <div className="gx-grid-2">
              <Field label="Business name" htmlFor="nc-name" required>
                <Input
                  id="nc-name"
                  name="name"
                  defaultValue={prefill?.name}
                  required
                  maxLength={200}
                  autoComplete="organization"
                  placeholder="e.g. Mehta Traders"
                  autoFocus
                />
              </Field>
              <Field label="Contact person" htmlFor="nc-contact">
                <Input
                  id="nc-contact"
                  name="contactPerson"
                  defaultValue={prefill?.contactPerson}
                  maxLength={200}
                  autoComplete="name"
                />
              </Field>
              <Field label="Phone (WhatsApp)" htmlFor="nc-phone">
                <Input
                  id="nc-phone"
                  name="phone"
                  defaultValue={prefill?.phone}
                  type="tel"
                  inputMode="tel"
                  maxLength={40}
                  autoComplete="tel"
                  placeholder="+91"
                />
              </Field>
              <Field
                label="PC limit"
                htmlFor="nc-pcs"
                hint="How many computers this client may use."
              >
                <Stepper
                  id="nc-pcs"
                  name="pcLimit"
                  defaultValue={1}
                  ariaDescribedBy="nc-pcs-hint"
                />
              </Field>
              <Field
                label="Membership ends on"
                htmlFor="nc-expires"
                required
                hint="Ends at 11:59 pm India time."
              >
                <Input
                  ref={dateRef}
                  id="nc-expires"
                  name="expiresOn"
                  type="date"
                  required
                  aria-describedby="nc-expires-hint"
                />
                <div className="gx-chips" role="group" aria-label="Quick dates">
                  {QUICK.map((q) => (
                    <button
                      key={q.months}
                      type="button"
                      className="gx-chip"
                      onClick={() => {
                        if (dateRef.current)
                          dateRef.current.value = istDatePlus(q.months);
                      }}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Notes" htmlFor="nc-notes">
                <Textarea
                  id="nc-notes"
                  name="notes"
                  defaultValue={prefill?.notes}
                  rows={4}
                  maxLength={2000}
                  placeholder="Only visible to you"
                />
              </Field>
            </div>
          </div>
          <footer className="gx-dialog__foot">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? "Creating…" : "Create client"}
            </Button>
          </footer>
        </form>
      </Dialog>
    </>
  );
}
