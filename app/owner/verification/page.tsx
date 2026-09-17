"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function VerificationPage() {
  const router = useRouter();

  const [verificationUrl, setVerificationUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const startVerification = async () => {
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "Could not start identity verification."
        );
      }

      if (!data?.url) {
        throw new Error("Didit did not return a verification URL.");
      }

      setVerificationUrl(data.url);
    } catch (err) {
      console.error("Didit verification error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not start identity verification."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDiditMessage = useCallback((event: MessageEvent) => {
    if (event.origin !== "https://verify.didit.me") {
      return;
    }

    const message = event.data;

    if (!message || typeof message.type !== "string") {
      return;
    }

    if (message.type === "didit:status_updated") {
      const newStatus = message.data?.status || "";
      setStatus(newStatus);

      if (newStatus === "Approved") {
        setVerified(true);
      }
    }

    if (message.type === "didit:completed") {
      const completedStatus = message.data?.status || "";
      setStatus(completedStatus);

      if (completedStatus === "Approved") {
        setVerified(true);
      }
    }

    if (message.type === "didit:error") {
      setError(
        message.data?.error ||
          "Didit reported an error during verification."
      );
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleDiditMessage);

    return () => {
      window.removeEventListener("message", handleDiditMessage);
    };
  }, [handleDiditMessage]);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "30px 20px",
        background: "#f8fafc",
      }}
    >
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          background: "#ffffff",
          borderRadius: "18px",
          padding: "28px",
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
        }}
      >
        <h1>Identity Verification</h1>

        {!verificationUrl && !verified && (
          <>
            <p style={{ color: "#666", lineHeight: 1.6 }}>
              Verify your identity securely with Didit without leaving
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

            <button
              type="button"
              onClick={startVerification}
              disabled={loading}
              style={{
                marginTop: "22px",
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
          </>
        )}

        {verificationUrl && !verified && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>Verify your identity</h2>

                {status && (
                  <p style={{ margin: "6px 0 0", color: "#666" }}>
                    Status: {status}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setVerificationUrl("")}
                style={{
                  padding: "9px 14px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <iframe
              src={verificationUrl}
              title="STUVANA Identity Verification"
              style={{
                width: "100%",
                height: "700px",
                border: "none",
                borderRadius: "14px",
              }}
              allow="camera; microphone; fullscreen; autoplay; encrypted-media"
            />
          </>
        )}

        {verified && (
          <div
            style={{
              padding: "24px",
              borderRadius: "14px",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Verification completed</h2>
            <p style={{ color: "#166534" }}>
              Your Didit verification has been completed successfully.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}