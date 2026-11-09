import { Brand, Card } from "@bakvion/ui";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <main className="stack" style={{ maxWidth: 380, margin: "64px auto" }}>
      <Brand />
      <Card>
        <LoginForm />
      </Card>
    </main>
  );
}
