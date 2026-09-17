"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function VerificationPage() {
  const router = useRouter();
  const sdkRef = useRef<any>(null);

  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      try {
        sdkRef.current?.destroy?.();
      } catch {
        // Ignore cleanup errors.
      }
    };
  }, []);

  async function startVerification() {
    setLoading(true);
    setError("");
    setStatus("");

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

      const data = await response.json();

      if (!response.ok || !data?.url) {
        throw new Error(
          data?.error || "Could not start identity verification."
        );
      }

      const { DiditSdk } = await import("@didit-protocol/sdk-web");

      sdkRef.current = DiditSdk.shared;

      sdkRef.current.onComplete = (result: any) => {
        const finalStatus = result?.session?.status || "Completed";
        setStatus(finalStatus);
        setStarted(false);
      };

      sdkRef.current.onStateChange = (
        state: string,
        sdkError?: string
      ) => {
        if (state === "error") {
          setError(sdkError || "Didit verification encountered an error.");
        }
      };

      sdkRef.current.startVerification({
        url: data.url,
        configuration: {
          embedded: true,
          embeddedContainerId: "didit-verification-container",
          loggingEnabled: false,
          showCloseButton: true,
          showExitConfirmation: true,
          closeModalOnComplete: false,
        },
      });

      setStarted(true);
    } catch (err) {
      console.error("Didit error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not start identity verification."
      );
    } finally {
      setLoading(false);
    }
  }

  function closeVerification() {
    try {
      sdkRef.current?.close?.();
    } catch {
      // Ignore close errors.
    }

    setStarted(false);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "32px 20px",
        background: "#f8fafc",
      }}
    >
      <section
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          background: "#fff",
          borderRadius: "18px",
          padding: "28px",
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
        }}
      >
        <h1>Identity Verification</h1>

        <p style={{ color: "#666", lineHeight: 1.6 }}>
          Complete your identity verification securely without leaving
          STUVANA.
        </p>

        {error && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 14px",
              borderRadius: "10px",
              background: "#fee2e2",
              color: "#991b1b",
            }}
          >
            {error}
          </div>
        )}

        {status && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 14px",
              borderRadius: "10px",
              background: "#f0fdf4",
              color: "#166534",
            }}
          >
            Verification status: {status}
          </div>
        )}

        {!started && (
          <button
            type="button"
            onClick={startVerification}
            disabled={loading}
            style={{
              marginTop: "24px",
              padding: "14px 22px",
              border: "none",
              borderRadius: "10px",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading
              ? "Starting verification..."
              : "Start Identity Verification"}
          </button>
        )}

        {started && (
          <button
            type="button"
            onClick={closeVerification}
            style={{
              marginTop: "16px",
              padding: "10px 16px",
              borderRadius: "8px",
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Close Verification
          </button>
        )}

        <div
          id="didit-verification-container"
          style={{
            width: "100%",
            minHeight: "700px",
            marginTop: "24px",
          }}
        />
      </section>
    </main>
  );
}