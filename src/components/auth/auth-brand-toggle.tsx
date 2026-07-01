"use client";

// Partner auth shell — ported from Fixfy Design System (AuthBrandToggle / Version A).
// Split layout: navy brand panel + sign-in / register form with email OTP.

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { T } from "@/lib/tokens";
import { DEFAULT_PLAN_ID } from "@/lib/plan-catalog";
import { AuthWordmark, BrandPanelBackground } from "@/components/brand/auth-wordmark";
import { Icon } from "@/components/ui/icon";

const ON_2 = "rgba(255,255,255,0.72)";
const ON_LINE_2 = "rgba(255,255,255,0.16)";
const E1 = "0 1px 3px rgba(2,0,64,0.08), 0 1px 2px rgba(2,0,64,0.06)";

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function StrokeIcon({ children, size = 18, sw = 1.7, color = "currentColor" }: { children: ReactNode; size?: number; sw?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function ValueProp({ icon, title, sub, light }: { icon: string; title: string; sub: string; light?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          flex: "0 0 auto",
          display: "grid",
          placeItems: "center",
          background: light ? "rgba(237,75,0,0.14)" : T.coralTint,
          color: T.coral,
        }}
      >
        <Icon name={icon} size={18} />
      </div>
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: light ? "#fff" : T.ink, letterSpacing: "-0.01em" }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 2, color: light ? ON_2 : T.mute }}>{sub}</div>
      </div>
    </div>
  );
}

function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function set(i: number, ch: string) {
    const d = ch.replace(/\D/g, "").slice(-1);
    const arr = value.split("");
    arr[i] = d;
    const next = arr.join("").slice(0, 6);
    onChange(next);
    if (d && i < 5) refs.current[i + 1]?.focus();
  }

  function key(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !value[i] && i > 0) refs.current[i - 1]?.focus();
  }

  return (
    <div style={{ display: "flex", gap: 10 }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ""}
          onChange={(e) => set(i, e.target.value)}
          onKeyDown={(e) => key(i, e)}
          style={{
            width: 48,
            height: 56,
            textAlign: "center",
            fontSize: 22,
            fontWeight: 600,
            fontFamily: T.mono,
            color: T.ink,
            border: `1px solid ${T.lineStrong}`,
            borderRadius: 10,
            outline: "none",
            background: T.white,
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = T.coral;
            e.target.style.boxShadow = `0 0 0 3px ${T.coralTint}`;
          }}
          onBlur={(e) => {
            e.target.style.borderColor = T.lineStrong;
            e.target.style.boxShadow = "none";
          }}
        />
      ))}
    </div>
  );
}

function AuthField({
  label,
  icon,
  type = "text",
  placeholder,
  value,
  onChange,
  optional,
}: {
  label: string;
  icon: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  const [foc, setFoc] = useState(false);
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: T.mono,
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: T.mute,
          marginBottom: 7,
        }}
      >
        {label}
        {optional && <span style={{ textTransform: "none", letterSpacing: 0, opacity: 0.8 }}>optional</span>}
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 14px",
          height: 50,
          border: `1px solid ${foc ? T.coral : T.lineStrong}`,
          borderRadius: 10,
          background: T.white,
          boxShadow: foc ? `0 0 0 3px ${T.coralTint}` : "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
        }}
      >
        <Icon name={icon} size={17} color={T.mute} />
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFoc(true)}
          onBlur={() => setFoc(false)}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 15,
            fontWeight: 500,
            color: T.ink,
            minWidth: 0,
            fontFamily: T.sans,
          }}
        />
      </span>
    </label>
  );
}

function PrimaryBtn({
  children,
  disabled,
  onClick,
  full = true,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  full?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: full ? "100%" : "auto",
        height: 50,
        border: "none",
        borderRadius: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        fontSize: 15,
        fontWeight: 600,
        fontFamily: T.sans,
        background: disabled ? T.paper2 : T.coral,
        color: disabled ? T.mute : T.white,
        boxShadow: disabled ? "none" : "0 1px 2px rgba(237,75,0,0.4)",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = T.coralHover;
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.background = T.coral;
      }}
    >
      {children}
    </button>
  );
}

function Alert({ tone, children }: { tone: "error" | "dev"; children: ReactNode }) {
  const isError = tone === "error";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        fontSize: 12.5,
        color: isError ? T.red : T.amber,
        background: isError ? T.red50 : T.amber50,
        borderRadius: 8,
        padding: "8px 10px",
        lineHeight: 1.4,
      }}
    >
      <Icon name={isError ? "alert-triangle" : "info"} size={14} />
      <span>{children}</span>
    </div>
  );
}

function SignInFlow({
  initialEmail = "",
  inviteCode = "",
  onRegister,
  onSendCode,
  onVerify,
  busy,
  error,
  devNote,
  inviteBanner,
}: {
  initialEmail?: string;
  inviteCode?: string;
  onRegister: () => void;
  onSendCode: (email: string, inviteCode?: string) => Promise<string | null>;
  onVerify: (email: string, code: string) => Promise<void>;
  busy: boolean;
  error: string | null;
  devNote: string | null;
  inviteBanner?: string | null;
}) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const valid = isEmail(email);

  useEffect(() => {
    if (initialEmail && isEmail(initialEmail)) setEmail(initialEmail);
  }, [initialEmail]);

  const send = async () => {
    if (!valid || busy) return;
    const otp = await onSendCode(email.trim(), inviteCode || undefined);
    setStep("code");
    if (otp) setCode(otp);
  };

  const verify = async () => {
    if (code.length < 6 || busy) return;
    await onVerify(email.trim(), code.trim());
  };

  if (step === "code") {
    return (
      <div
        onKeyDown={(e) => {
          if (e.key === "Enter" && code.length === 6) verify();
        }}
      >
        <button
          type="button"
          onClick={() => {
            setStep("email");
            setCode("");
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: T.mute,
            fontSize: 13,
            padding: 0,
            marginBottom: 18,
            fontFamily: T.sans,
          }}
        >
          <StrokeIcon size={15}>
            <path d="M15 6l-6 6 6 6" />
          </StrokeIcon>
          Back
        </button>
        <h2 style={{ fontSize: 25, fontWeight: 600, letterSpacing: "-0.02em", color: T.ink, margin: 0 }}>Enter your code</h2>
        <p style={{ fontSize: 14, color: T.mute, margin: "8px 0 22px", lineHeight: 1.5 }}>
          We sent a 6-digit code to <b style={{ color: T.ink }}>{email}</b>.
        </p>
        <CodeBoxes value={code} onChange={setCode} />
        <div style={{ marginTop: 22 }}>
          <PrimaryBtn disabled={busy || code.length < 6} onClick={verify}>
            {busy ? "Verifying…" : "Verify & sign in"}{" "}
            <StrokeIcon size={17}>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </StrokeIcon>
          </PrimaryBtn>
        </div>
        {error && (
          <div style={{ marginTop: 16 }}>
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        {devNote && (
          <div style={{ marginTop: 12 }}>
            <Alert tone="dev">{devNote}</Alert>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Enter" && valid) send();
      }}
    >
      <h2 style={{ fontSize: 25, fontWeight: 600, letterSpacing: "-0.02em", color: T.ink, margin: 0 }}>Sign in</h2>
      <p style={{ fontSize: 14, color: T.mute, margin: "8px 0 24px", lineHeight: 1.5 }}>
        We&apos;ll email you a 6-digit sign-in code. No password to remember.
      </p>
      {inviteBanner && (
        <div style={{ marginBottom: 16, fontSize: 13, color: T.slate, background: T.coralTint, borderRadius: 8, padding: "10px 12px", lineHeight: 1.45 }}>
          {inviteBanner}
        </div>
      )}
      <AuthField label="Work email" icon="mail" type="email" placeholder="you@company.co.uk" value={email} onChange={setEmail} />
      <div style={{ marginTop: 16 }}>
        <PrimaryBtn disabled={busy || !valid} onClick={send}>
          {busy ? "Sending…" : "Send code"}{" "}
          <StrokeIcon size={17}>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </StrokeIcon>
        </PrimaryBtn>
      </div>
      {error && (
        <div style={{ marginTop: 16 }}>
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {devNote && (
        <div style={{ marginTop: 12 }}>
          <Alert tone="dev">{devNote}</Alert>
        </div>
      )}
      <p style={{ fontSize: 13.5, color: T.mute, marginTop: 24, textAlign: "center" }}>
        New to Fixfy?{" "}
        <button
          type="button"
          onClick={onRegister}
          style={{
            color: T.coralHover,
            fontWeight: 600,
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 2,
            background: "none",
            border: "none",
            fontFamily: T.sans,
            fontSize: "inherit",
            padding: 0,
          }}
        >
          Start a 7-day free trial
        </button>
      </p>
    </div>
  );
}

function RegisterFlow({
  onSignIn,
  onCreateAccount,
  onVerify,
  busy,
  error,
  devNote,
  initialFullName = "",
  initialCompany = "",
  initialEmail = "",
  inviteCode = "",
  inviteBanner,
}: {
  onSignIn: () => void;
  onCreateAccount: (data: { fullName: string; company: string; email: string; inviteCode?: string }) => Promise<string | null>;
  onVerify: (email: string, code: string) => Promise<void>;
  busy: boolean;
  error: string | null;
  devNote: string | null;
  initialFullName?: string;
  initialCompany?: string;
  initialEmail?: string;
  inviteCode?: string;
  inviteBanner?: string | null;
}) {
  const [step, setStep] = useState<"details" | "code">("details");
  const [fullName, setFullName] = useState(initialFullName);
  const [company, setCompany] = useState(initialCompany);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const valid = fullName.trim() && company.trim() && isEmail(email);

  useEffect(() => {
    if (initialFullName) setFullName(initialFullName);
    if (initialCompany) setCompany(initialCompany);
    if (initialEmail && isEmail(initialEmail)) setEmail(initialEmail);
  }, [initialFullName, initialCompany, initialEmail]);

  const create = async () => {
    if (!valid || busy) return;
    const otp = await onCreateAccount({
      fullName: fullName.trim(),
      company: company.trim(),
      email: email.trim(),
      inviteCode: inviteCode || undefined,
    });
    setStep("code");
    if (otp) setCode(otp);
  };

  const verify = async () => {
    if (code.length < 6 || busy) return;
    await onVerify(email.trim(), code.trim());
  };

  if (step === "code") {
    return (
      <div
        onKeyDown={(e) => {
          if (e.key === "Enter" && code.length === 6) verify();
        }}
      >
        <button
          type="button"
          onClick={() => {
            setStep("details");
            setCode("");
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: T.mute,
            fontSize: 13,
            padding: 0,
            marginBottom: 18,
            fontFamily: T.sans,
          }}
        >
          <StrokeIcon size={15}>
            <path d="M15 6l-6 6 6 6" />
          </StrokeIcon>
          Back
        </button>
        <h2 style={{ fontSize: 25, fontWeight: 600, letterSpacing: "-0.02em", color: T.ink, margin: 0 }}>Enter your code</h2>
        <p style={{ fontSize: 14, color: T.mute, margin: "8px 0 22px", lineHeight: 1.5 }}>
          We sent a 6-digit code to <b style={{ color: T.ink }}>{email}</b>.
        </p>
        <CodeBoxes value={code} onChange={setCode} />
        <div style={{ marginTop: 22 }}>
          <PrimaryBtn disabled={busy || code.length < 6} onClick={verify}>
            {busy ? "Verifying…" : "Start free trial"}{" "}
            <StrokeIcon size={17}>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </StrokeIcon>
          </PrimaryBtn>
        </div>
        {error && (
          <div style={{ marginTop: 16 }}>
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        {devNote && (
          <div style={{ marginTop: 12 }}>
            <Alert tone="dev">{devNote}</Alert>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Enter" && valid) create();
      }}
    >
      <h2 style={{ fontSize: 25, fontWeight: 600, letterSpacing: "-0.02em", color: T.ink, margin: 0 }}>
        {inviteCode ? "Complete your account" : "Create your account"}
      </h2>
      <p style={{ fontSize: 14, color: T.mute, margin: "8px 0 22px", lineHeight: 1.5 }}>
        {inviteCode
          ? "Confirm your details — we'll email you a code to sign in and finish onboarding."
          : "Start a 7-day free trial. No card required."}
      </p>
      {inviteBanner && (
        <div style={{ marginBottom: 14, fontSize: 13, color: T.slate, background: T.coralTint, borderRadius: 8, padding: "10px 12px", lineHeight: 1.45 }}>
          {inviteBanner}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <AuthField label="Full name" icon="user" placeholder="Jordan Maguire" value={fullName} onChange={setFullName} />
        <AuthField label="Company / trading name" icon="briefcase" placeholder="Maguire Plumbing Ltd" value={company} onChange={setCompany} />
        <AuthField label="Work email" icon="mail" type="email" placeholder="you@company.co.uk" value={email} onChange={setEmail} />
      </div>
      <div style={{ marginTop: 18 }}>
        <PrimaryBtn disabled={busy || !valid} onClick={create}>
          {busy ? "Creating…" : "Create account"}{" "}
          <StrokeIcon size={17}>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </StrokeIcon>
        </PrimaryBtn>
      </div>
      {error && (
        <div style={{ marginTop: 16 }}>
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {devNote && (
        <div style={{ marginTop: 12 }}>
          <Alert tone="dev">{devNote}</Alert>
        </div>
      )}
      <p style={{ fontSize: 12, color: T.mute, marginTop: 12, lineHeight: 1.5 }}>
        By continuing you agree to Fixfy&apos;s Terms &amp; Privacy Policy.
      </p>
      <p style={{ fontSize: 13.5, color: T.mute, marginTop: 16 }}>
        Already a partner?{" "}
        <button
          type="button"
          onClick={onSignIn}
          style={{
            color: T.coral,
            fontWeight: 600,
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 2,
            background: "none",
            border: "none",
            fontFamily: T.sans,
            fontSize: "inherit",
            padding: 0,
          }}
        >
          Sign in
        </button>
      </p>
    </div>
  );
}

export function AuthBrandToggle({
  initialMode = "signin",
  initialEmail = "",
  initialInviteCode = "",
  initialInviteError = false,
}: {
  initialMode?: "signin" | "register";
  initialEmail?: string;
  initialInviteCode?: string;
  initialInviteError?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "register">(initialInviteCode ? "register" : initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    initialInviteError
      ? "This invite link has expired or couldn't sign you in automatically. Request a new invite from Fixfy, or continue below with your email."
      : null,
  );
  const [devNote, setDevNote] = useState<string | null>(null);
  const [inviteCode] = useState(initialInviteCode);
  const [invitePrefill, setInvitePrefill] = useState({
    fullName: "",
    company: "",
    email: initialEmail,
  });
  const [inviteBanner, setInviteBanner] = useState<string | null>(
    initialInviteCode ? "You've been invited to join Fixfy Trade." : null,
  );

  useEffect(() => {
    if (!initialInviteCode) return;
    void fetch(`/api/auth/invite?code=${encodeURIComponent(initialInviteCode)}`)
      .then((r) => r.json())
      .then((data: { ok?: boolean; email?: string; contactName?: string; companyName?: string; hasAuth?: boolean; error?: string }) => {
        if (!data.ok) {
          setError(data.error || "This invite link has expired or is invalid.");
          return;
        }
        setInvitePrefill({
          email: data.email || initialEmail,
          fullName: data.contactName || "",
          company: data.companyName || data.contactName || "",
        });
        if (data.hasAuth) {
          setMode("signin");
          setInviteBanner("Welcome back — sign in with your email to continue onboarding.");
        } else {
          setMode("register");
          setInviteBanner("You've been invited to join Fixfy Trade. Complete your account to start onboarding.");
        }
      })
      .catch(() => setError("Couldn't load your invite. Try the link from your email again."));
  }, [initialInviteCode, initialEmail]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const clearMessages = () => {
    setError(null);
    setDevNote(null);
  };

  const sendCode = async (email: string, code?: string): Promise<string | null> => {
    clearMessages();
    setBusy(true);
    let returnedCode: string | null = null;
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, inviteCode: code || inviteCode || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        devCode?: string;
        emailError?: string;
        genError?: string;
        notPartner?: boolean;
      };
      if (!res.ok) throw new Error("Couldn't send the code. Try again.");
      if (data.notPartner) {
        setDevNote("This email isn't a registered partner. No code sent.");
      } else if (data.devCode) {
        returnedCode = data.devCode;
        setDevNote(
          `Dev: code is ${data.devCode}` +
            (data.emailError ? ` · email failed: ${data.emailError}` : "") +
            (data.genError ? ` · ${data.genError}` : ""),
        );
      } else if (data.emailError) {
        setDevNote(`Email send failed: ${data.emailError}`);
      } else if (data.genError) {
        setDevNote(`Auth: ${data.genError}`);
      }
      return returnedCode;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the code.");
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const verifySignIn = async (email: string, code: string) => {
    clearMessages();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token: code }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "That code didn't work.");
      router.replace(inviteCode ? "/?welcome=1" : "/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async (payload: {
    fullName: string;
    company: string;
    email: string;
    inviteCode?: string;
  }): Promise<string | null> => {
    clearMessages();
    setBusy(true);
    let returnedCode: string | null = null;
    try {
      const useInvite = payload.inviteCode || inviteCode;
      const endpoint = useInvite ? "/api/auth/claim-invite" : "/api/auth/signup";
      const body = useInvite
        ? {
            email: payload.email,
            fullName: payload.fullName,
            company: payload.company,
            inviteCode: useInvite,
          }
        : { ...payload, plan: DEFAULT_PLAN_ID };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; devCode?: string; emailError?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't create your account.");
      if (data.devCode) {
        returnedCode = data.devCode;
        setDevNote(`Dev: code is ${data.devCode}${data.emailError ? ` · email failed: ${data.emailError}` : ""}`);
      } else if (data.emailError) {
        setDevNote(`Email send failed: ${data.emailError}`);
      }
      return returnedCode;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create your account.");
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const verifySignup = async (email: string, code: string) => {
    clearMessages();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token: code }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "That code didn't work.");
      router.replace("/?welcome=1");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const goGetStarted = () => {
    window.location.href = "/get-started";
  };

  const switchMode = (next: "signin" | "register") => {
    if (next === "register" && !inviteCode) {
      goGetStarted();
      return;
    }
    setMode(next);
    clearMessages();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        width: "100%",
        minHeight: "100vh",
        fontFamily: T.sans,
        background: T.white,
      }}
    >
      {/* Brand panel */}
      <BrandPanelBackground
        style={{
          flex: "1.12 1 0",
          padding: "48px 52px",
          display: "flex",
          flexDirection: "column",
        }}
        className="auth-brand-panel"
      >
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 420 }}>
          <AuthWordmark light size={24} />
          <div style={{ marginTop: "auto" }}>
            <div
              style={{
                fontFamily: T.mono,
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: T.coral,
              }}
            >
              Fixfy Trade · Partner Network
            </div>
            <h1
              style={{
                fontSize: 40,
                fontWeight: 600,
                letterSpacing: "-0.03em",
                lineHeight: 1.08,
                margin: "16px 0 0",
                maxWidth: "15ch",
              }}
            >
              Win more work.
              <br />
              Get paid faster.
            </h1>
            <p style={{ fontSize: 15.5, lineHeight: 1.6, color: ON_2, margin: "18px 0 34px", maxWidth: "42ch" }}>
              Real local work opportunities matched to your trade, service area and availability.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: "40ch" }}>
              <ValueProp light icon="map-pin" title="Jobs sent to you" sub="Vetted local work, matched to your trade and postcode." />
              <ValueProp light icon="wallet" title="Weekly self-bill payouts" sub="We invoice the client — you get paid on a clear schedule." />
              <ValueProp light icon="zap" title="Run it all in one place" sub="Quotes, schedule, team and invoices, together." />
            </div>
          </div>
          <div className="auth-stats" style={{ marginTop: "auto", paddingTop: 36 }}>
            <div className="auth-stats-top">
              <span className="auth-stat">
                <b style={{ color: "#fff", fontWeight: 600 }}>275K+</b> jobs delivered across London
              </span>
              <span className="auth-stat-divider" />
              <span className="auth-stat">
                <b style={{ color: "#fff", fontWeight: 600 }}>£72m+</b> processed through the platform
              </span>
            </div>
            <div className="auth-stats-rating">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="star" size={13} color={T.coral} />
                <b style={{ color: "#fff", fontWeight: 600 }}>4.8</b> partner satisfaction
              </span>
            </div>
          </div>
        </div>
      </BrandPanelBackground>

      {/* Form panel */}
      <div
        style={{
          flex: "1 1 0",
          display: "flex",
          flexDirection: "column",
          padding: "40px 56px",
          minWidth: 0,
        }}
        className="auth-form-panel"
      >
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <span style={{ fontSize: 13, color: T.mute }}>
            Need help?{" "}
            <a href="mailto:support@getfixfy.com" style={{ color: T.slate, fontWeight: 500 }}>
              Contact support
            </a>
          </span>
        </div>
        <div style={{ margin: "auto", width: "100%", maxWidth: 392 }}>
          <div
            style={{
              display: "flex",
              background: T.paper2,
              borderRadius: 11,
              padding: 4,
              marginBottom: 30,
            }}
          >
            {(
              [
                ["signin", "Sign in"],
                ["register", "Create account"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => switchMode(id)}
                style={{
                  flex: 1,
                  height: 40,
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13.5,
                  fontWeight: 600,
                  fontFamily: T.sans,
                  background: mode === id ? T.white : "transparent",
                  color: mode === id ? T.ink : T.mute,
                  boxShadow: mode === id ? E1 : "none",
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "signin" ? (
            <SignInFlow
              initialEmail={invitePrefill.email || initialEmail}
              inviteCode={inviteCode}
              inviteBanner={inviteBanner}
              onRegister={goGetStarted}
              onSendCode={sendCode}
              onVerify={verifySignIn}
              busy={busy}
              error={error}
              devNote={devNote}
            />
          ) : (
            <RegisterFlow
              initialFullName={invitePrefill.fullName}
              initialCompany={invitePrefill.company}
              initialEmail={invitePrefill.email || initialEmail}
              inviteCode={inviteCode}
              inviteBanner={inviteBanner}
              onSignIn={() => switchMode("signin")}
              onCreateAccount={createAccount}
              onVerify={verifySignup}
              busy={busy}
              error={error}
              devNote={devNote}
            />
          )}
        </div>
        <div
          style={{
            fontFamily: T.mono,
            fontSize: 11,
            color: T.mute,
            textAlign: "center",
            letterSpacing: "0.04em",
          }}
        >
          © 2026 Fixfy · partners.getfixfy.com
        </div>
      </div>

      <style jsx global>{`
        .auth-stats-top {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          align-items: center;
          gap: clamp(10px, 1.6vw, 22px);
          font-family: var(--font-geist-mono), "JetBrains Mono", ui-monospace, monospace;
          font-size: clamp(9.5px, 0.82vw, 12.5px);
          color: rgba(255, 255, 255, 0.72);
          line-height: 1.2;
        }
        .auth-stat {
          white-space: nowrap;
        }
        .auth-stat-divider {
          width: 1px;
          height: 14px;
          background: rgba(255, 255, 255, 0.16);
          flex-shrink: 0;
        }
        .auth-stats-rating {
          display: flex;
          justify-content: center;
          margin-top: 14px;
          font-family: var(--font-geist-mono), "JetBrains Mono", ui-monospace, monospace;
          font-size: clamp(9.5px, 0.82vw, 12.5px);
          color: rgba(255, 255, 255, 0.72);
          white-space: nowrap;
        }
        @media (max-width: 960px) {
          .auth-brand-panel {
            display: none !important;
          }
          .auth-form-panel {
            padding: 32px 24px !important;
          }
        }
      `}</style>
    </div>
  );
}
