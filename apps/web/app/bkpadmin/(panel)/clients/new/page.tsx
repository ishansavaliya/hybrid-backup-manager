import { Button, Card } from "@bakvion/ui";
import { createClientAction } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="stack">
      <h1>New client</h1>
      {error ? <div className="error">{error}</div> : null}
      <Card>
        <form action={createClientAction} className="stack">
          <label className="field">
            Name
            <input name="name" required />
          </label>
          <label className="field">
            Contact person
            <input name="contactPerson" />
          </label>
          <label className="field">
            Phone
            <input name="phone" />
          </label>
          <label className="field">
            Notes
            <textarea name="notes" />
          </label>
          <label className="field">
            Membership ends on
            <input name="expiresOn" type="date" required />
          </label>
          <label className="field">
            PC limit
            <input
              name="pcLimit"
              type="number"
              min={1}
              max={100}
              defaultValue={1}
              required
            />
          </label>
          <label className="row">
            <input name="isTest" type="checkbox" /> Test client
          </label>
          <div>
            <Button type="submit">Create client</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
