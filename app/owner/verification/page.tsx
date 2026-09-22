"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type VerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "rejected"
  | null;

export default function VerificationPage() {
  const router = useRouter();

  const sdkRef = useRef<any>(null);
  const sessionUrlRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [started, setStarted] = useState(false);
  const [sessionUrl, setSessionUrl] = useState<string | null>(null);

  const [verificationStatus, setVerificationStatus] =
    useState<VerificationStatus>(null);

  const [verificationIdType, setVerificationIdType] =
    useState<string | null>(null);

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  /*
   * Get the current user's verification status from Supabase.
   */
  async function loadVerificationStatus() {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return null;
      }

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select(
          "verification_status, verification_id_type"
        )
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error(
          "Could not load verification status:",
          profileError
        );

        return null;
      }

      const currentStatus =
        (data?.verification_status as VerificationStatus) ||
        "unverified";

      setVerificationStatus(currentStatus);
      setVerificationIdType(
        data?.verification_id_type || null
      );

      return currentStatus;
    } catch (err) {
      console.error(
        "Verification status check error:",
        err
      );

      return null;
    } finally {
      setCheckingStatus(false);
    }
  }

  /*
   * Load the user's current verification status
   * when the page opens.
   */
  useEffect(() => {
    loadVerificationStatus();
  }, []);

  /*
   * Poll Supabase after Didit finishes.
   *
   * Didit -> webhook -> Supabase can take a few seconds,
   * so we check repeatedly instead of making the user refresh.
   */
  function startStatusPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
    }

    let attempts = 0;
    const maxAttempts = 30;

    pollRef.current = setInterval(async () => {
      attempts++;

      const currentStatus = await loadVerificationStatus();

      if (
        currentStatus === "verified" ||
        currentStatus === "rejected" ||
        currentStatus === "pending" ||
        attempts >= maxAttempts
      ) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }

        if (currentStatus === "verified") {
          setStatus(
            "Your identity has been successfully verified."
          );

          /*
           * Send the owner back to Add Property
           * after verification is confirmed in Supabase.
           */
          setTimeout(() => {
            router.push("/owner/add-property");
          }, 1200);
        } else if (currentStatus === "rejected") {
          setStatus(
            "Your identity verification was rejected."
          );
        } else if (currentStatus === "pending") {
          setStatus(
            "Your verification is being reviewed."
          );
        } else {
          setStatus(
            "Verification is still being processed. Please check again shortly."
          );
        }
      }
    }, 2000);
  }

  /*
   * Stop polling when leaving the page.
   */
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }

      try {
        sdkRef.current?.destroy?.();
      } catch {
        // Ignore cleanup errors.
      }
    };
  }, []);

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
        const { DiditSdk } = await import(
          "@didit-protocol/sdk-web"
        );

        if (cancelled) {
          return;
        }

        sdkRef.current = DiditSdk.shared;

        sdkRef.current.onComplete = (result: any) => {
          console.log(
            "Didit completion result:",
            result
          );

          /*
           * Didit can return:
           * completed
           * cancelled
           * failed
           */

          if (result?.type === "completed") {
            setStatus(
              "Verification completed. Confirming your verification status..."
            );

            setStarted(false);
            setSessionUrl(null);

            /*
             * Give the Didit webhook time to update Supabase,
             * then begin checking the profile.
             */
            startStatusPolling();

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
          console.log(
            "Didit state:",
            state,
            sdkError
          );

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
        console.error(
          "Didit launch error:",
          err
        );

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
      const response = await fetch(
        "/api/didit/create-session",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: user.id,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data?.url) {
        throw new Error(
          data?.error ||
            "Could not create a new verification session."
        );
      }

      console.log(
        "New Didit session created."
      );

      sessionUrlRef.current = data.url;

      /*
       * First render the Didit container.
       * The useEffect above will then start Didit.
       */
      setSessionUrl(data.url);
      setStarted(true);
    } catch (err) {
      console.error(
        "Didit session error:",
        err
      );

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

  /*
   * Show a dedicated verified screen.
   */
  if (!checkingStatus && verificationStatus === "verified") {
    return (
      <main
        style={{
          minHeight: "100vh",
          padding: "20px 12px",
          background: "#f8fafc",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <section
          style={{
            width: "100%",
            maxWidth: "600px",
            background: "#fff",
            borderRadius: "18px",
            padding: "40px 24px",
            boxShadow:
              "0 8px 30px rgba(0,0,0,0.08)",
            textAlign: "center",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
              margin: "0 auto 20px",
              borderRadius: "50%",
              background: "#dcfce7",
              color: "#15803d",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "38px",
              fontWeight: 700,
            }}
          >
            ✓
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "32px",
              color: "#166534",
            }}
          >
            Identity Verified
          </h1>

          <p
            style={{
              marginTop: "14px",
              color: "#4b5563",
              lineHeight: 1.6,
              fontSize: "16px",
            }}
          >
            Your identity has been successfully
            verified on STUVANA.
          </p>

          {verificationIdType && (
            <p
              style={{
                marginTop: "10px",
                color: "#6b7280",
                fontSize: "14px",
              }}
            >
              Verification document:{" "}
              <strong>
                {verificationIdType}
              </strong>
            </p>
          )}

          <p
            style={{
              marginTop: "18px",
              color: "#6b7280",
              fontSize: "14px",
            }}
          >
            Returning you to Add Property...
          </p>

          <button
            type="button"
            onClick={() =>
              router.push("/owner/add-property")
            }
            style={{
              marginTop: "24px",
              width: "100%",
              maxWidth: "300px",
              padding: "14px 20px",
              border: "none",
              borderRadius: "10px",
              background: "#15803d",
              color: "#fff",
              fontWeight: 700,
              fontSize: "16px",
              cursor: "pointer",
            }}
          >
            Continue to Add Property
          </button>
        </section>
      </main>
    );
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
          Complete your identity verification
          securely without leaving STUVANA.
        </p>

        {verificationStatus === "pending" && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 14px",
              borderRadius: "10px",
              background: "#fef3c7",
              color: "#92400e",
              lineHeight: 1.5,
            }}
          >
            Your verification is currently being
            reviewed.
          </div>
        )}

        {verificationStatus === "rejected" && (
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
            Your previous verification was rejected.
            You can start a new verification below.
          </div>
        )}

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

        {!started &&
          verificationStatus !== "pending" && (
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