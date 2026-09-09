import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import { useAuth } from "../../context/AuthContext";
import aimesigLogo from "../../assets/aimesig-logo.png";

type AuthMode = "login" | "register";

function getFirebaseErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    switch (error.code) {
      case "auth/invalid-email":
        return "Please enter a valid email address.";

      case "auth/email-already-in-use":
        return "An account with this email already exists.";

      case "auth/weak-password":
        return "Password should be at least 6 characters.";

      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Email or password is incorrect.";

      case "auth/too-many-requests":
        return "Too many attempts. Please wait a moment and try again.";

      case "auth/network-request-failed":
        return "Network error. Please check your internet connection.";

      case "auth/user-disabled":
        return "This account has been disabled.";

      default:
        return "Something went wrong. Please try again.";
    }
  }

  return "Something went wrong. Please try again.";
}

function getErrorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return null;
}

export default function AuthScreen() {
  const { login, register, resetPassword } = useAuth();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isRegister = mode === "register";

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErrorMessage("");
    setSuccessMessage("");
    setPassword("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    if (isRegister && password.length < 6) {
      setErrorMessage("Password should be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      if (isRegister) {
        await register(normalizedEmail, password);
      } else {
        await login(normalizedEmail, password);
      }
    } catch (error) {
      const code = getErrorCode(error);

      if (code === "auth/operation-not-allowed") {
        setErrorMessage(
          "Email/password authentication is not enabled in Firebase.",
        );
      } else {
        setErrorMessage(getFirebaseErrorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setErrorMessage("");
    setSuccessMessage("");

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setErrorMessage(
        "Enter your email address first, then choose Forgot password.",
      );
      return;
    }

    setResetLoading(true);

    try {
      await resetPassword(normalizedEmail);

      setSuccessMessage(
        "If an account exists for this email, a password reset email has been sent.",
      );
    } catch (error) {
      setErrorMessage(getFirebaseErrorMessage(error));
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto grid min-h-screen max-w-7xl lg:grid-cols-2">
        {/* Brand panel */}
        <section className="relative hidden overflow-hidden bg-[var(--accent-pink)] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-[var(--success)] opacity-30 blur-3xl" />

          <div className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-[var(--text-muted)] opacity-10 blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-3">
              <img
                src={aimesigLogo}
                alt="AimeSig logo"
                className="h-11 w-11 shrink-0 object-contain"
              />

              <div>
                <p className="font-bold tracking-tight">
                  AimeSig Wellness
                </p>

                <p className="text-xs text-[var(--text-faint)]">
                  Your daily wellness companion
                </p>
              </div>
            </div>
          </div>

          <div className="relative max-w-lg">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[var(--bg-elevated)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--accent-pink-soft)]">
              <ShieldCheck size={14} />
              PRIVATE & PERSONAL
            </div>

            <h1 className="text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
              Build better routines.
              <br />
              Live with intention.
            </h1>

            <p className="mt-5 max-w-md text-base leading-7 text-[var(--text-faint)]">
              Keep your daily routines, wellness measurements, and progress
              together in one calm and focused space.
            </p>
          </div>

          <div className="relative flex items-center gap-3 text-sm text-[var(--text-faint)]">
            <LockKeyhole size={16} />
            Your wellness data belongs to you.
          </div>
        </section>

        {/* Authentication panel */}
        <section className="flex items-center justify-center px-5 py-8 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            {/* Mobile brand */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <img
                src={aimesigLogo}
                alt="AimeSig logo"
                className="h-11 w-11 shrink-0 object-contain"
              />

              <div>
                <p className="font-bold tracking-tight text-[var(--text-primary)]">
                  AimeSig Wellness
                </p>

                <p className="text-xs text-[var(--text-secondary)]">
                  Your daily wellness companion
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                {isRegister ? "GET STARTED" : "WELCOME BACK"}
              </p>

              <h2 className="mt-1 text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                {isRegister ? "Create your account" : "Sign in to Wellness"}
              </h2>

              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {isRegister
                  ? "Start building a healthier and more consistent routine."
                  : "Continue where you left off."}
              </p>
            </div>

            {/* Mode switch */}
            <div className="mt-7 grid grid-cols-2 rounded-2xl bg-[var(--bg-elevated)] p-1">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  !isRegister
                    ? "bg-[var(--bg-elevated)] text-[var(--accent-pink)] shadow-sm"
                    : "text-[var(--text-secondary)]"
                }`}
              >
                Sign in
              </button>

              <button
                type="button"
                onClick={() => switchMode("register")}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  isRegister
                    ? "bg-[var(--bg-elevated)] text-[var(--accent-pink)] shadow-sm"
                    : "text-[var(--text-secondary)]"
                }`}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-[var(--text-secondary)]"
                >
                  Email address
                </label>

                <div className="relative">
                  <Mail
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  />

                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-3.5 pl-11 pr-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)] focus:ring-4 focus:ring-[var(--accent-pink-soft)]"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="block text-sm font-semibold text-[var(--text-secondary)]"
                  >
                    Password
                  </label>

                  {!isRegister && (
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={resetLoading}
                      className="text-xs font-semibold text-[var(--success)] hover:text-[var(--accent-pink)] disabled:opacity-50"
                    >
                      {resetLoading ? "Sending..." : "Forgot password?"}
                    </button>
                  )}
                </div>

                <div className="relative">
                  <KeyRound
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  />

                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={
                      isRegister ? "new-password" : "current-password"
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-3.5 pl-11 pr-12 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)] focus:ring-4 focus:ring-[var(--accent-pink-soft)]"
                  />

                  <button
                    type="button"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2 text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
                  >
                    {showPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>

              {/* Error */}
              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-2xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-4 py-3 text-sm leading-5 text-[var(--danger)]"
                >
                  {errorMessage}
                </div>
              )}

              {/* Success */}
              {successMessage && (
                <div
                  role="status"
                  className="rounded-2xl border border-[var(--success-soft)] bg-[var(--bg-elevated)] px-4 py-3 text-sm leading-5 text-[var(--success)]"
                >
                  {successMessage}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent-pink)] px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-4 focus:ring-[var(--accent-pink-soft)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-strong)]/30 border-t-white" />
                    {isRegister ? "Creating account..." : "Signing in..."}
                  </>
                ) : (
                  <>
                    {isRegister ? (
                      <UserPlus size={18} />
                    ) : (
                      <ArrowRight size={18} />
                    )}

                    {isRegister ? "Create account" : "Sign in"}
                  </>
                )}
              </button>
            </form>

            <p className="mt-7 text-center text-xs leading-5 text-[var(--text-muted)]">
              By continuing, you agree to use AimeSig Wellness responsibly and
              keep your account credentials secure.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}