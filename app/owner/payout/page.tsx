"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function OwnerPayoutPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [earnings, setEarnings] = useState(0);
  const [payoutAccount, setPayoutAccount] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadPayoutData() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("account_type")
          .eq("id", user.id)
          .single();

        if (!profile || profile.account_type !== "owner") {
          router.push("/");
          return;
        }

        const { data: bookings, error: bookingsError } =
          await supabase
            .from("bookings")
            .select("owner_amount")
            .eq("owner_id", user.id)
            .eq("status", "paid")
            .is("payout_id", null);

        if (bookingsError) {
          console.error(bookingsError);
          setError("Could not load your earnings.");
        } else {
          const total = (bookings || []).reduce(
            (sum, booking) =>
              sum + Number(booking.owner_amount || 0),
            0
          );

          setEarnings(total);
        }

        const { data: account, error: accountError } =
          await supabase
            .from("owner_payment_accounts")
            .select(
              "payout_method, momo_network, momo_number, bank_name, bank_account_name, bank_account_number, status"
            )
            .eq("owner_id", user.id)
            .maybeSingle();

        if (accountError) {
          console.error(accountError);
        }

        setPayoutAccount(account || null);
      } catch (err) {
        console.error(err);
        setError("Could not load payout information.");
      } finally {
        setLoading(false);
      }
    }

    loadPayoutData();
  }, [router]);

  async function handleWithdraw() {
    setError("");
    setMessage("");

    if (!payoutAccount) {
      setError(
        "Please connect a Bank or MoMo payout account first."
      );
      return;
    }

    if (payoutAccount.status !== "active") {
      setError(
        "Your payout account is not active."
      );
      return;
    }

    if (earnings <= 0) {
      setError(
        "You do not have any available earnings to withdraw."
      );
      return;
    }

    const confirmed = window.confirm(
      `Withdraw GH₵${earnings.toLocaleString(
        "en-GH",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }
      )}?`
    );

    if (!confirmed) return;

    setWithdrawing(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.push("/login");
        return;
      }

      const response = await fetch(
        "/api/owner/payout",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "Could not process your payout."
        );
        return;
      }

      setMessage(
        data.message ||
          "Your payout has been submitted successfully."
      );

      setEarnings(0);
    } catch (err) {
      console.error(err);

      setError(
        "Something went wrong while processing your payout."
      );
    } finally {
      setWithdrawing(false);
    }
  }

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p>Loading payout information...</p>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px 20px",
        background: "#f7f7f7",
      }}
    >
      <div
        style={{
          maxWidth: "620px",
          margin: "0 auto",
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            marginBottom: "20px",
          }}
        >
          ← Back
        </button>

        <div
          style={{
            background: "#fff",
            borderRadius: "20px",
            padding: "32px",
            boxShadow:
              "0 10px 35px rgba(0,0,0,0.06)",
          }}
        >
          <p className="hero-label">STUVANA</p>

          <h1 style={{ marginTop: "8px" }}>
            Withdraw Earnings
          </h1>

          <p
            style={{
              color: "#666",
              lineHeight: "1.6",
              marginBottom: "28px",
            }}
          >
            Withdraw your available accommodation
            earnings to your connected Bank or MoMo
            account.
          </p>

          {error && (
            <div
              style={{
                padding: "14px",
                marginBottom: "20px",
                borderRadius: "10px",
                background: "#fff0f0",
                color: "#b00020",
              }}
            >
              {error}
            </div>
          )}

          {message && (
            <div
              style={{
                padding: "14px",
                marginBottom: "20px",
                borderRadius: "10px",
                background: "#effaf1",
                color: "#176b2c",
              }}
            >
              {message}
            </div>
          )}

          <div
            style={{
              padding: "24px",
              borderRadius: "16px",
              background: "#f7f7f7",
              marginBottom: "24px",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#666",
              }}
            >
              Available earnings
            </p>

            <h2
              style={{
                fontSize: "36px",
                margin: "8px 0 0",
              }}
            >
              GH₵{" "}
              {earnings.toLocaleString("en-GH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </h2>
          </div>

          <div
            style={{
              padding: "20px",
              border: "1px solid #eee",
              borderRadius: "14px",
              marginBottom: "24px",
            }}
          >
            <p
              style={{
                marginTop: 0,
                fontWeight: 600,
              }}
            >
              Payout account
            </p>

            {!payoutAccount ? (
              <>
                <p
                  style={{
                    color: "#666",
                    lineHeight: "1.5",
                  }}
                >
                  You haven't connected a payout
                  account yet.
                </p>

                <button
                  type="button"
                  className="details-secondary-button"
                  onClick={() =>
                    router.push(
                      "/owner/payout-account"
                    )
                  }
                >
                  Connect Payout Account
                </button>
              </>
            ) : (
              <>
                <p style={{ margin: "6px 0" }}>
                  <strong>Method:</strong>{" "}
                  {payoutAccount.payout_method ===
                  "momo"
                    ? "📱 MoMo"
                    : "🏦 Bank"}
                </p>

                {payoutAccount.payout_method ===
                  "momo" && (
                  <>
                    <p style={{ margin: "6px 0" }}>
                      <strong>Network:</strong>{" "}
                      {payoutAccount.momo_network}
                    </p>

                    <p style={{ margin: "6px 0" }}>
                      <strong>Number:</strong>{" "}
                      {payoutAccount.momo_number}
                    </p>
                  </>
                )}

                {payoutAccount.payout_method ===
                  "bank" && (
                  <>
                    <p style={{ margin: "6px 0" }}>
                      <strong>Bank:</strong>{" "}
                      {payoutAccount.bank_name ||
                        "Bank account"}
                    </p>

                    <p style={{ margin: "6px 0" }}>
                      <strong>Account:</strong>{" "}
                      {payoutAccount.bank_account_number}
                    </p>
                  </>
                )}

                <p
                  style={{
                    margin: "10px 0 0",
                    color:
                      payoutAccount.status ===
                      "active"
                        ? "#176b2c"
                        : "#b00020",
                  }}
                >
                  Status:{" "}
                  {payoutAccount.status}
                </p>
              </>
            )}
          </div>

          <button
            type="button"
            className="details-primary-button"
            onClick={handleWithdraw}
            disabled={
              withdrawing ||
              earnings <= 0 ||
              !payoutAccount ||
              payoutAccount.status !== "active"
            }
            style={{
              width: "100%",
              padding: "15px",
              opacity:
                withdrawing ||
                earnings <= 0 ||
                !payoutAccount ||
                payoutAccount.status !== "active"
                  ? 0.6
                  : 1,
              cursor:
                withdrawing ||
                earnings <= 0 ||
                !payoutAccount ||
                payoutAccount.status !== "active"
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {withdrawing
              ? "Processing payout..."
              : "Withdraw Earnings"}
          </button>

          <button
            type="button"
            onClick={() =>
              router.push(
                "/owner/payout-account"
              )
            }
            style={{
              width: "100%",
              marginTop: "12px",
              padding: "14px",
              borderRadius: "10px",
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Change Payout Account
          </button>
        </div>
      </div>
    </main>
  );
}