"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function SignupPage() {
  const router = useRouter();

  const [accountType, setAccountType] = useState("student");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [university, setUniversity] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();

    if (accountType === "student" && !university) {
      alert("Please select your university.");
      return;
    }

    if (accountType === "owner" && !businessName.trim()) {
      alert("Please enter your property or business name.");
      return;
    }

    setLoading(true);

    try {
      const redirectUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/login`
          : undefined;

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectUrl,

          data: {
            full_name: fullName.trim(),
            phone: phone.trim(),
            account_type: accountType,
            university:
              accountType === "student"
                ? university
                : null,
            business_name:
              accountType === "owner"
                ? businessName.trim()
                : null,
          },
        },
      });

      if (error) {
        alert(error.message);
        return;
      }

      if (!data.user) {
        alert(
          "Account could not be created. Please try again."
        );
        return;
      }

      alert(
        "Account created successfully! Check your email to verify your account."
      );

      router.push("/login");
    } catch (error) {
      console.error("Signup error:", error);

      alert(
        "Something went wrong while creating your account. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card signup-card">
        <a href="/" className="auth-logo">
          STUVANA
        </a>

        <h1>Create Your Account</h1>

        <p className="auth-subtitle">
          Join STUVANA and find or list student accommodation.
        </p>

        <form onSubmit={handleSignup}>
          <label>I am a</label>

          <div className="account-types">
            <button
              type="button"
              className={
                accountType === "student"
                  ? "active-type"
                  : ""
              }
              onClick={() => setAccountType("student")}
              disabled={loading}
            >
              🎓 Student
            </button>

            <button
              type="button"
              className={
                accountType === "owner"
                  ? "active-type"
                  : ""
              }
              onClick={() => setAccountType("owner")}
              disabled={loading}
            >
              🏠 Property Owner
            </button>
          </div>

          <label>Full Name</label>

          <input
            type="text"
            placeholder="Enter your full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            disabled={loading}
          />

          <label>Email Address</label>

          <input
            type="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />

          <label>Phone Number</label>

          <input
            type="tel"
            placeholder="Enter your phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            disabled={loading}
          />

          {accountType === "student" ? (
            <>
              <label>University</label>

              <select
                className="auth-select"
                value={university}
                onChange={(e) =>
                  setUniversity(e.target.value)
                }
                required
                disabled={loading}
              >
                <option value="">
                  Select your university
                </option>

                <option>UPSA</option>
                <option>University of Ghana</option>
                <option>KNUST</option>
                <option>
                  University of Cape Coast
                </option>
                <option>
                  Accra Technical University
                </option>
                <option>GIMPA</option>
              </select>
            </>
          ) : (
            <>
              <label>Property/Business Name</label>

              <input
                type="text"
                placeholder="Enter your property or business name"
                value={businessName}
                onChange={(e) =>
                  setBusinessName(e.target.value)
                }
                required
                disabled={loading}
              />
            </>
          )}

          <label>Password</label>

          <input
            type="password"
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            disabled={loading}
          />

          <button
            type="submit"
            className="auth-button"
            disabled={loading}
          >
            {loading
              ? "Creating Account..."
              : "Create Account"}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{" "}
          <a href="/login">Log In</a>
        </p>
      </div>
    </main>
  );
}