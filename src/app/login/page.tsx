"use client";

import { LockKeyhole, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ResetPasswordUseCase, SignInUseCase } from "@/application/use-cases/auth";
import { FirebaseAuthRepository } from "@/infrastructure/firebase/auth-repository";
import { toUserMessage } from "@/lib/firebase-errors";
import { routes } from "@/lib/routes";
import { ADMIN_EMAIL } from "@/lib/auth-config";
import { BrandMark } from "@/presentation/components/brand-mark";
import { useAuth } from "@/presentation/providers/auth-provider";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const repository = useMemo(() => new FirebaseAuthRepository(), []);
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!authLoading && user) router.replace(routes.dashboard);
  }, [authLoading, router, user]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setMessage(""); setSuccess(false);
    try {
      await new SignInUseCase(repository).execute(email, password);
      // The auth-state observer owns navigation. Moving before it publishes
      // the signed-in user can make AuthGuard send a valid session back here.
    } catch (error) {
      setMessage(toUserMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    if (loading) return;
    setLoading(true); setMessage(""); setSuccess(false);
    try {
      await new ResetPasswordUseCase(repository).execute(email);
      setMessage("Password reset email sent. Check your inbox and spam folder.");
      setSuccess(true);
    } catch (error) {
      setMessage(toUserMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <BrandMark />
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <h1>Welcome back</h1>
          <p>Please enter your details to access your account.</p>
          <div className="field"><label htmlFor="email">Email Address</label><input id="email" type="email" autoComplete="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          <div className="auth-form__row"><label><input type="checkbox" /> Remember for 30 days</label><button type="button" onClick={handleReset}>Forgot password?</button></div>
          {message && <div className={`form-message ${success ? "form-message--success" : ""}`} role="alert">{message}</div>}
          <button className="button button--primary auth-submit" disabled={loading} type="submit">{loading ? "Signing in…" : "Sign In"} <span aria-hidden>→</span></button>
        </form>
        <div className="secure-note"><LockKeyhole size={11} /> Secure cloud access with 256-bit encryption.</div>
      </section>
      <section className="auth-preview" aria-hidden="true">
        <div className="preview-card">
          <div className="preview-art"><div className="preview-window"><Star color="#10b981" fill="#10b981" /><div className="preview-bars"><i style={{ height: "36%" }} /><i style={{ height: "74%" }} /><i style={{ height: "50%" }} /><i style={{ height: "90%" }} /></div></div></div>
          <div className="preview-card__copy"><h2>Access your business from anywhere.</h2><p>Manage clients, projects, invoices, payments, statements, and Excel exports in one secure system. Designed for clarity, engineered for speed.</p></div>
        </div>
      </section>
    </main>
  );
}
