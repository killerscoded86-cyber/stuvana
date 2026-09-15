"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PayoutMethod = "momo" | "bank";

export default function PayoutAccountPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [payoutMethod, setPayoutMethod] =
    useState<PayoutMethod>("momo");

  const [name, setName] = useState("");

  const [momoNetwork, setMomoNetwork] = useState("MTN");
  const [momoNumber, setMomoNumber] = useState("");

  const [bankName, setBankName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] =
    useState("");

  useEffect(() => {
    async function loadOwner() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        const { data: profile, error: profileError } =
          await supabase
            .from("profiles")
            .select("account_type, full_name")
            .eq("id", user.id)
            .single();

        if (
          profileError ||
          !profile ||
          profile.account_type !== "owner"
        ) {
          router.push("/");
          return;
        }

        setName(profile.full_name || "");

        const { data: payoutAccount } = await supabase
          .from("owner_payment_accounts")
          .select("*")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (payoutAccount) {
          setPayoutMethod(
            payoutAccount.payout_method || "momo"
          );

          setMomoNetwork(
            payoutAccount.momo_network || "MTN"
          );

          setMomoNumber(
            payoutAccount.momo_number || ""
          );

          setBankName(
            payoutAccount.bank_name || ""
          );

          setBankAccountName(
            payoutAccount.bank_account_name || ""
          );

          setBankAccountNumber(
            payoutAccount.bank_account_number || ""
          );
        }
      } catch (err) {
        console.error(err);
        setError("Could not load your payout information.");
      } finally {
        setLoading(false);
      }
    }

    loadOwner();
  }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!name.trim()) {
      setError("Please enter the account name.");
      return;
    }

    if (payoutMethod === "momo" && !momoNumber.trim()) {
      setError("Please enter your MoMo number.");
      return;
    }

    if (payoutMethod === "bank") {
      if (!bankCode.trim()) {
        setError("Please enter your bank code.");
        return;
      }

      if (!bankAccountNumber.trim()) {
        setError("Please enter your bank account number.");
        return;
      }
    }

    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.push("/login");
        return;
      }

      const response = await fetch(
        "/api/owner/payout-account",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            payout_method: payoutMethod,
            name: name.trim(),

            momo_network:
              payoutMethod === "momo"
                ? momoNetwork
                : null,

            momo_number:
              payoutMethod === "momo"
                ? momoNumber.trim()
                : null,

            bank_code:
              payoutMethod === "bank"
                ? bankCode.trim()
                : null,

            bank_name:
              payoutMethod === "bank"
                ? bankName.trim()
                : null,

            bank_account_name:
              payoutMethod === "bank"
                ? bankAccountName.trim()
                : null,

            bank_account_number:
              payoutMethod === "bank"
                ? bankAccountNumber.trim()
                : null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "Could not connect your payout account."
        );
        return;
      }

      setMessage(
        "Your payout account has been connected successfully."
      );
    } catch (err) {
      console.error(err);
      setError(
        "Something went wrong while connecting your payout account."
      );
    } finally {
      setSaving(false);
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
        <p>Loading...</p>
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
          background: "#fff",
          borderRadius: "20px",
          padding: "32px",
          boxShadow: "0 10px 35px rgba(0,0,0,0.06)",
        }}
      >
        <button
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

        <p className="hero-label">STUVANA</p>

        <h1 style={{ marginTop: "8px" }}>
          Payout Account
        </h1>

        <p
          style={{
            color: "#666",
            lineHeight: "1.6",
            marginBottom: "28px",
          }}
        >
          Choose where you want to receive your accommodation
          earnings.
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

        <form onSubmit={handleSubmit}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: 600,
            }}
          >
            Account name
          </label>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name on the account"
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "10px",
              border: "1px solid #ddd",
              marginBottom: "22px",
              boxSizing: "border-box",
            }}
          />

          <label
            style={{
              display: "block",
              marginBottom: "10px",
              fontWeight: 600,
            }}
          >
            Payout method
          </label>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "24px",
            }}
          >
            <button
              type="button"
              onClick={() => setPayoutMethod("momo")}
              style={{
                padding: "16px",
                borderRadius: "12px",
                cursor: "pointer",
                border:
                  payoutMethod === "momo"
                    ? "2px solid #111"
                    : "1px solid #ddd",
                background:
                  payoutMethod === "momo"
                    ? "#f5f5f5"
                    : "#fff",
                fontWeight: 600,
              }}
            >
              📱 MoMo
            </button>

            <button
              type="button"
              onClick={() => setPayoutMethod("bank")}
              style={{
                padding: "16px",
                borderRadius: "12px",
                cursor: "pointer",
                border:
                  payoutMethod === "bank"
                    ? "2px solid #111"
                    : "1px solid #ddd",
                background:
                  payoutMethod === "bank"
                    ? "#f5f5f5"
                    : "#fff",
                fontWeight: 600,
              }}
            >
              🏦 Bank
            </button>
          </div>

          {payoutMethod === "momo" && (
            <>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                }}
              >
                MoMo network
              </label>

              <select
                value={momoNetwork}
                onChange={(e) =>
                  setMomoNetwork(e.target.value)
                }
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "10px",
                  border: "1px solid #ddd",
                  marginBottom: "18px",
                  background: "#fff",
                }}
              >
                <option value="MTN">MTN</option>
                <option value="Telecel">Telecel</option>
                <option value="AirtelTigo">
                  AirtelTigo
                </option>
              </select>

              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                }}
              >
                MoMo number
              </label>

              <input
                type="tel"
                value={momoNumber}
                onChange={(e) =>
                  setMomoNumber(e.target.value)
                }
                placeholder="e.g. 0241234567"
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "10px",
                  border: "1px solid #ddd",
                  marginBottom: "22px",
                  boxSizing: "border-box",
                }}
              />
            </>
          )}

          {payoutMethod === "bank" && (
            <>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                }}
              >
                Bank name
              </label>

              <input
                value={bankName}
                onChange={(e) =>
                  setBankName(e.target.value)
                }
                placeholder="e.g. GCB Bank"
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "10px",
                  border: "1px solid #ddd",
                  marginBottom: "18px",
                  boxSizing: "border-box",
                }}
              />

              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                }}
              >
                Bank code
              </label>

              <input
                value={bankCode}
                onChange={(e) =>
                  setBankCode(e.target.value)
                }
                placeholder="Paystack bank code"
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "10px",
                  border: "1px solid #ddd",
                  marginBottom: "18px",
                  boxSizing: "border-box",
                }}
              />

              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                }}
              >
                Account name
              </label>

              <input
                value={bankAccountName}
                onChange={(e) =>
                  setBankAccountName(e.target.value)
                }
                placeholder="Name on bank account"
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "10px",
                  border: "1px solid #ddd",
                  marginBottom: "18px",
                  boxSizing: "border-box",
                }}
              />

              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 600,
                }}
              >
                Account number
              </label>

              <input
                type="text"
                value={bankAccountNumber}
                onChange={(e) =>
                  setBankAccountNumber(e.target.value)
                }
                placeholder="Bank account number"
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "10px",
                  border: "1px solid #ddd",
                  marginBottom: "22px",
                  boxSizing: "border-box",
                }}
              />
            </>
          )}

          <button
            type="submit"
            disabled={saving}
            className="details-primary-button"
            style={{
              width: "100%",
              padding: "15px",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving
              ? "Connecting..."
              : "Connect Payout Account"}
          </button>
        </form>
      </div>
    </main>
  );
}