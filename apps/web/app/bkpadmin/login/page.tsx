import { ShieldCheck } from "lucide-react";
import { BrandMark, ThemeToggle } from "../ui";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <main className="gx-login">
      <div className="gx-login__corner">
        <ThemeToggle />
      </div>
      <div className="gx-login__wrap">
        <section className="gx-login__card" aria-labelledby="admin-sign-in">
          <div className="gx-login__brand">
            <BrandMark withName />
            <span className="gx-badge gx-login__tag">Admin</span>
          </div>
          <div className="gx-login__heading">
            <h1 id="admin-sign-in">Admin sign in</h1>
            <p>Bakvion owner panel</p>
          </div>
          <LoginForm />
        </section>
        <p className="gx-login__foot">
          <ShieldCheck size={14} aria-hidden="true" />
          Admin sign-ins are logged in History.
        </p>
      </div>
    </main>
  );
}
