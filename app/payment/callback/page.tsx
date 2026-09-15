"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [status, setStatus] = useState("verifying");
  const [message, setMessage] = useState(
    "Please wait while we confirm your payment..."
  );

  useEffect(() => {
    async function verifyPayment() {
      const reference = searchParams.get("reference");

      if (!reference) {
        setStatus("error");
        setMessage("No payment reference was found.");
        return;
      }

      try {
        const response = await fetch("/api/payments/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reference,
          }),
        });

        const responseText = await response.text();

        console.log("VERIFY STATUS:", response.status);
        console.log("VERIFY RESPONSE:", responseText);

        let data;

        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(
            `Verification API returned ${response.status}: ${responseText.slice(
              0,
              300
            )}`
          );
        }

        if (!response.ok) {
          setStatus("error");
          setMessage(
            data.error ||
              `Payment verification failed. Server returned ${response.status}.`
          );
          return;
        }

        if (data.success) {
          setStatus("success");
          setMessage(
            "Your payment was successful and your accommodation booking has been confirmed."
          );
        } else {
          setStatus("error");
          setMessage(
            data.error ||
              "Your payment was not completed successfully."
          );
        }
      } catch (error) {
        console.error("Verification error:", error);

        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Something went wrong while verifying your payment."
        );
      }
    }

    verifyPayment();
  }, [searchParams]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "520px",
          textAlign: "center",
          padding: "40px 24px",
          borderRadius: "20px",
          border: "1px solid rgba(0,0,0,0.08)",
          background: "#fff",
        }}
      >
        <p className="hero-label" style={{ marginBottom: "12px" }}>
          STUVANA
        </p>

        {status === "verifying" && (
          <>
            <div style={{ fontSize: "48px", marginBottom: "20px" }}>
              ⏳
            </div>
            <h1>Verifying Payment</h1>
          </>
        )}

        {status === "success" && (
          <>
            <div style={{ fontSize: "56px", marginBottom: "20px" }}>
              ✅
            </div>
            <h1>Payment Successful</h1>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize: "56px", marginBottom: "20px" }}>
              ❌
            </div>
            <h1>Payment Not Confirmed</h1>
          </>
        )}

        <p
          style={{
            marginTop: "16px",
            color: "#666",
            lineHeight: "1.6",
            wordBreak: "break-word",
          }}
        >
          {message}
        </p>

        {status !== "verifying" && (
          <button
            className="details-primary-button"
            onClick={() => router.push("/")}
            style={{
              marginTop: "24px",
              width: "100%",
            }}
          >
            Back to STUVANA
          </button>
        )}
      </section>
    </main>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <section
            style={{
              width: "100%",
              maxWidth: "520px",
              textAlign: "center",
              padding: "40px 24px",
            }}
          >
            <p className="hero-label">STUVANA</p>
            <div style={{ fontSize: "48px", marginTop: "20px" }}>
              ⏳
            </div>
            <h1>Loading Payment</h1>
            <p style={{ marginTop: "16px", color: "#666" }}>
              Please wait...
            </p>
          </section>
        </main>
      }
    >
      <PaymentCallbackContent />
    </Suspense>
  );
}