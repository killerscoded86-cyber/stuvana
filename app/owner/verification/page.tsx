"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function VerificationPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startVerification() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const response = await fetch("/api/didit/create-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error || "Unable to start identity verification."
        );
      }

      if (!result?.url) {
        throw new Error("Didit did not return a verification URL.");
      }

      window.location.assign(result.url);
    } catch (err) {
      console.error("Verification error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to start identity verification."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="dashboard-page">
      <section
        style={{
          maxWidth: "700px",
          margin: "0 auto",
          padding: "40px 20px",
        }}
      >
        <h1>Identity Verification</h1>

        <p style={{ color: "#666", marginTop: "10px" }}>
          Verify your identity securely with Didit to continue using STUVANA.
        </p>

        {error && (
          <div
            style={{
              marginTop: "20px",
              padding: "12px 16px",
              borderRadius: "10px",
              background: "#fee2e2",
              color: "#991b1b",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={startVerification}
          disabled={loading}
          style={{
            marginTop: "24px",
            padding: "14px 22px",
            borderRadius: "10px",
            border: "none",
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Starting..." : "Start Identity Verification"}
        </button>
      </section>
    </main>
  );
}