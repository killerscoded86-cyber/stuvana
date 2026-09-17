"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function VerificationPage() {
  const router = useRouter();

  const sdkRef = useRef<any>(null);
  const sessionUrlRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [sessionUrl, setSessionUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  /*
   * Start Didit only AFTER React has rendered
   * the verification container.
   */
  useEffect(() => {
    if (!started || !sessionUrl) {
      return;
    }

    let cancelled = false;

    async function launchDidit() {
      try {
        const { DiditSdk } = await import("@didit-protocol/sdk-web");

        if (cancelled) {
          return;
        }

        sdkRef.current = DiditSdk.shared;

        sdkRef.current.onComplete = (result: any) => {
          console.log("Didit completion result:", result);

          /*
           * Didit can return:
           * completed
           * cancelled
           * failed
           */

          if (result?.type === "completed") {
            const diditStatus = result?.session?.status;

            if (diditStatus) {
              setStatus(`Verification status: ${diditStatus}`);
            } else {
              setStatus("Verification completed. Status is being processed.");
            }

            setStarted(false);
            setSessionUrl(null);
            return;
          }

          if (result?.type === "cancelled") {
            setStatus("Verification cancelled.");
            setStarted(false);
            setSessionUrl(null);
            return;
          }

          if (result?.type === "failed") {
            setError(
              result?.error?.message ||
                "Didit verification failed. Please try again."
            );

            setStarted(false);
            setSessionUrl(null);
            return;
          }

          /*
           * Unknown result:
           * Never call this a successful verification.
           */
          setError(
            "Verification ended without a confirmed verification result."
          );

          setStarted(false);
          setSessionUrl(null);
        };

        sdkRef.current.onStateChange = (
          state: string,
          sdkError?: string
        ) => {
          console.log("Didit state:", state, sdkError);

          if (state === "error") {
            setError(
              sdkError ||
                "Didit verification encountered an error."
            );
          }
        };

        sdkRef.current.startVerification({
          url: sessionUrl,
          configuration: {
            embedded: true,
            embeddedContainerId:
              "didit-verification-container",
            loggingEnabled: true,
            showCloseButton: true,
            showExitConfirmation: true,
            closeModalOnComplete: false,
          },
        });
      } catch (err) {
        console.error("Didit launch error:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Could not launch identity verification."
        );

        setStarted(false);
        setSessionUrl(null);
      }
    }

    /*
     * Give React one frame to render the container
     * before Didit tries to mount inside it.
     */
    const frame = requestAnimationFrame(() => {
      launchDidit();
    });

    return () => {
      cancelAnimationFrame(frame);
      cancelled = true;
    };
  }, [started, sessionUrl]);

  /*
   * Clean up Didit only when leaving the page.
   */
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

      /*
       * Ask our backend for a NEW Didit verification session.
       */
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
          data?.error ||
            "Could not create a new verification session."
        );
      }

      console.log("New Didit session created.");

      sessionUrlRef.current = data.url;

      /*
       * First render the Didit container.
       * The useEffect above will then start Didit.
       */
      setSessionUrl(data.url);
      setStarted(true);
    } catch (err) {
      console.error("Didit session error:", err);

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
    setSessionUrl(null);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "20px 12px",
        background: "#f8fafc",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "900px",
          margin: "0 auto",
          background: "#fff",
          borderRadius: "18px",
          padding: "24px 16px",
          boxShadow:
            "0 8px 30px rgba(0,0,0,0.08)",
          boxSizing: "border-box",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(30px, 7vw, 48px)",
            lineHeight: 1.1,
            color: "#1f2937",
          }}
        >
          Identity Verification
        </h1>

        <p
          style={{
            color: "#666",
            lineHeight: 1.6,
            fontSize: "16px",
            marginTop: "14px",
          }}
        >
          Complete your identity verification securely
          without leaving STUVANA.
        </p>

        {error && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 14px",
              borderRadius: "10px",
              background: "#fee2e2",
              color: "#991b1b",
              lineHeight: 1.5,
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
              lineHeight: 1.5,
            }}
          >
            {status}
          </div>
        )}

        {!started && (
          <button
            type="button"
            onClick={startVerification}
            disabled={loading}
            style={{
              marginTop: "24px",
              width: "100%",
              maxWidth: "420px",
              padding: "15px 20px",
              border: "none",
              borderRadius: "10px",
              background: "#15803d",
              color: "#fff",
              fontWeight: 700,
              fontSize: "16px",
              cursor: loading
                ? "not-allowed"
                : "pointer",
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
              color: "#111827",
              cursor: "pointer",
            }}
          >
            Close Verification
          </button>
        )}

        {started && (
          <div
            id="didit-verification-container"
            style={{
              width: "100%",
              height: "800px",
              marginTop: "20px",
              borderRadius: "12px",
              boxSizing: "border-box",
              overflow: "auto",
            }}
          />
        )}
      </section>
    </main>
  );
}