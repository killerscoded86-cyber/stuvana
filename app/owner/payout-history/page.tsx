"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Payout = {
  id: number;
  owner_id: string;
  amount: number;
  currency: string;
  recipient_code: string | null;
  payout_method: "momo" | "bank" | string | null;
  reference: string;
  status: "pending" | "success" | "failed" | "reversed" | string;
  transfer_code: string | null;
  paystack_transfer_id: number | null;
  created_at: string;
  updated_at: string | null;
};

type PayoutAccount = {
  payout_method: "momo" | "bank";
  momo_network: string | null;
  momo_number: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
};

export default function OwnerPayoutHistoryPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [payoutAccount, setPayoutAccount] =
    useState<PayoutAccount | null>(null);

  const [availableEarnings, setAvailableEarnings] =
    useState(0);

  const [error, setError] = useState("");

  async function loadData(showRefresh = false) {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("account_type")
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

      /*
       * =====================================================
       * PAYOUT HISTORY
       * =====================================================
       */

      const {
        data: payoutData,
        error: payoutError,
      } = await supabase
        .from("owner_payouts")
        .select(
          "id, owner_id, amount, currency, recipient_code, payout_method, reference, status, transfer_code, paystack_transfer_id, created_at, updated_at"
        )
        .eq("owner_id", user.id)
        .order("created_at", {
          ascending: false,
        });

      if (payoutError) {
        console.error(
          "Payout history error:",
          payoutError
        );

        setError(
          "Could not load your payout history."
        );
      } else {
        setPayouts(
          (payoutData || []) as Payout[]
        );
      }

      /*
       * =====================================================
       * CURRENT PAYOUT ACCOUNT
       * =====================================================
       */

      const {
        data: account,
        error: accountError,
      } = await supabase
        .from("owner_payment_accounts")
        .select(
          "payout_method, momo_network, momo_number, bank_name, bank_account_name, bank_account_number"
        )
        .eq("owner_id", user.id)
        .maybeSingle();

      if (accountError) {
        console.error(
          "Payout account lookup error:",
          accountError
        );
      }

      setPayoutAccount(
        (account as PayoutAccount | null) || null
      );

      /*
       * =====================================================
       * AVAILABLE EARNINGS
       * =====================================================
       */

      const {
        data: bookings,
        error: bookingsError,
      } = await supabase
        .from("bookings")
        .select("owner_amount")
        .eq("owner_id", user.id)
        .eq("status", "paid")
        .is("payout_id", null);

      if (bookingsError) {
        console.error(
          "Available earnings error:",
          bookingsError
        );
      } else {
        const total = (bookings || []).reduce(
          (sum, booking) =>
            sum + Number(booking.owner_amount || 0),
          0
        );

        setAvailableEarnings(total);
      }
    } catch (err) {
      console.error(
        "Payout history load error:",
        err
      );

      setError(
        "Could not load payout information."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function formatMoney(amount: number) {
    return Number(amount || 0).toLocaleString(
      "en-GH",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    );
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleString(
      "en-GH",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    );
  }

  function formatMethod(
    payout: Payout
  ) {
    if (
      payout.payout_method ===
      "momo"
    ) {
      return "📱 MoMo";
    }

    if (
      payout.payout_method ===
      "bank"
    ) {
      return "🏦 Bank";
    }

    return "Payout";
  }

  function getStatusLabel(
    status: string
  ) {
    switch (
      status.toLowerCase()
    ) {
      case "success":
        return "Successful";

      case "pending":
        return "Pending";

      case "failed":
        return "Failed";

      case "reversed":
        return "Reversed";

      default:
        return status;
    }
  }

  function getStatusStyle(
    status: string
  ) {
    switch (
      status.toLowerCase()
    ) {
      case "success":
        return {
          background: "#dcfce7",
          color: "#166534",
        };

      case "pending":
        return {
          background: "#fef3c7",
          color: "#92400e",
        };

      case "failed":
      case "reversed":
        return {
          background: "#fee2e2",
          color: "#991b1b",
        };

      default:
        return {
          background: "#f3f4f6",
          color: "#374151",
        };
    }
  }

  function maskNumber(
    value: string | null
  ) {
    if (!value) {
      return "Not provided";
    }

    if (value.length <= 4) {
      return `•••• ${value}`;
    }

    return `•••• ${value.slice(-4)}`;
  }

  function getPayoutAccountLabel() {
    if (!payoutAccount) {
      return "No payout account";
    }

    if (
      payoutAccount.payout_method ===
      "momo"
    ) {
      return `MoMo •••• ${(
        payoutAccount.momo_number ||
        ""
      ).slice(-4)}`;
    }

    return `Bank •••• ${(
      payoutAccount.bank_account_number ||
      ""
    ).slice(-4)}`;
  }

  const totalSuccessful = payouts
    .filter(
      (payout) =>
        payout.status.toLowerCase() ===
        "success"
    )
    .reduce(
      (sum, payout) =>
        sum + Number(payout.amount || 0),
      0
    );

  const totalPending = payouts
    .filter(
      (payout) =>
        payout.status.toLowerCase() ===
        "pending"
    )
    .reduce(
      (sum, payout) =>
        sum + Number(payout.amount || 0),
      0
    );

  const totalFailedOrReversed = payouts
    .filter(
      (payout) =>
        payout.status.toLowerCase() ===
          "failed" ||
        payout.status.toLowerCase() ===
          "reversed"
    )
    .reduce(
      (sum, payout) =>
        sum + Number(payout.amount || 0),
      0
    );

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          background: "#f7f7f7",
        }}
      >
        <div
          style={{
            textAlign: "center",
          }}
        >
          <p className="hero-label">
            STUVANA
          </p>

          <h2
            style={{
              marginTop: "8px",
            }}
          >
            Loading payout history...
          </h2>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "30px 20px 60px",
        background: "#f7f7f7",
      }}
    >
      <div
        style={{
          maxWidth: "1000px",
          margin: "0 auto",
        }}
      >
        {/* HEADER */}

        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "20px",
          }}
        >
          <button
            type="button"
            onClick={() =>
              router.push(
                "/owner/payout"
              )
            }
            style={{
              border: "none",
              background:
                "transparent",
              cursor: "pointer",
              padding: "8px 0",
              fontWeight: 600,
            }}
          >
            ← Back to Payouts
          </button>

          <button
            type="button"
            onClick={() =>
              loadData(true)
            }
            disabled={refreshing}
            style={{
              padding: "9px 13px",
              borderRadius: "10px",
              border:
                "1px solid #ddd",
              background: "#fff",
              cursor: refreshing
                ? "not-allowed"
                : "pointer",
            }}
          >
            {refreshing
              ? "Refreshing..."
              : "↻ Refresh"}
          </button>
        </div>

        <div
          style={{
            marginBottom: "24px",
          }}
        >
          <p className="hero-label">
            PROPERTY OWNER
          </p>

          <h1
            style={{
              marginTop: "7px",
            }}
          >
            Payout History
          </h1>

          <p
            style={{
              color: "#666",
              lineHeight: 1.6,
              marginTop: "8px",
            }}
          >
            View your previous withdrawals,
            payout status, and available
            earnings.
          </p>
        </div>

        {error && (
          <div
            style={{
              padding:
                "14px 16px",
              marginBottom:
                "20px",
              borderRadius:
                "12px",
              background:
                "#fff0f0",
              border:
                "1px solid #fecaca",
              color:
                "#b00020",
            }}
          >
            {error}
          </div>
        )}

        {/* SUMMARY CARDS */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "14px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              padding: "20px",
              borderRadius: "16px",
              background: "#fff",
              border:
                "1px solid #e5e7eb",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#666",
                fontSize: "13px",
              }}
            >
              Available Earnings
            </p>

            <h2
              style={{
                margin:
                  "7px 0 0",
                fontSize: "26px",
              }}
            >
              GH₵{" "}
              {formatMoney(
                availableEarnings
              )}
            </h2>
          </div>

          <div
            style={{
              padding: "20px",
              borderRadius: "16px",
              background: "#fff",
              border:
                "1px solid #e5e7eb",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#666",
                fontSize: "13px",
              }}
            >
              Total Successfully Paid
            </p>

            <h2
              style={{
                margin:
                  "7px 0 0",
                fontSize: "26px",
                color: "#166534",
              }}
            >
              GH₵{" "}
              {formatMoney(
                totalSuccessful
              )}
            </h2>
          </div>

          <div
            style={{
              padding: "20px",
              borderRadius: "16px",
              background: "#fff",
              border:
                "1px solid #e5e7eb",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#666",
                fontSize: "13px",
              }}
            >
              Pending Payouts
            </p>

            <h2
              style={{
                margin:
                  "7px 0 0",
                fontSize: "26px",
                color: "#92400e",
              }}
            >
              GH₵{" "}
              {formatMoney(
                totalPending
              )}
            </h2>
          </div>
        </div>

        {/* CURRENT ACCOUNT */}

        <div
          style={{
            padding: "18px 20px",
            borderRadius: "16px",
            background: "#fff",
            border:
              "1px solid #e5e7eb",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: "12px",
                  color: "#777",
                  fontWeight: 700,
                }}
              >
                CURRENT PAYOUT ACCOUNT
              </p>

              <h3
                style={{
                  margin:
                    "6px 0 0",
                }}
              >
                {getPayoutAccountLabel()}
              </h3>
            </div>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/owner/payout-account"
                )
              }
            >
              Manage Account
            </button>
          </div>

          {payoutAccount && (
            <p
              style={{
                margin:
                  "8px 0 0",
                color: "#666",
                fontSize: "13px",
              }}
            >
              {payoutAccount.payout_method ===
              "momo"
                ? `${payoutAccount.momo_network || "MoMo"} ${maskNumber(
                    payoutAccount.momo_number
                  )}`
                : `${payoutAccount.bank_name || "Bank"} ${maskNumber(
                    payoutAccount.bank_account_number
                  )}`}
            </p>
          )}
        </div>

        {/* PAYOUT HISTORY */}

        <div
          style={{
            background: "#fff",
            borderRadius: "18px",
            border:
              "1px solid #e5e7eb",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "20px",
              borderBottom:
                "1px solid #e5e7eb",
            }}
          >
            <p className="hero-label">
              TRANSACTION RECORD
            </p>

            <h2
              style={{
                marginTop: "6px",
              }}
            >
              Your Payouts
            </h2>
          </div>

          {payouts.length === 0 ? (
            <div
              style={{
                padding: "50px 20px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "44px",
                  marginBottom:
                    "10px",
                }}
              >
                💰
              </div>

              <h3>
                No payouts yet
              </h3>

              <p
                style={{
                  color: "#666",
                  maxWidth:
                    "460px",
                  margin:
                    "8px auto 20px",
                  lineHeight: 1.6,
                }}
              >
                Once you make a withdrawal,
                your payout record will
                appear here.
              </p>

              <button
                type="button"
                className="details-primary-button"
                onClick={() =>
                  router.push(
                    "/owner/payout"
                  )
                }
              >
                Go to Withdraw Earnings
              </button>
            </div>
          ) : (
            <div>
              {payouts.map(
                (payout, index) => {
                  const statusStyle =
                    getStatusStyle(
                      payout.status
                    );

                  return (
                    <article
                      key={
                        payout.id
                      }
                      style={{
                        padding:
                          "20px",
                        borderBottom:
                          index ===
                          payouts.length -
                            1
                            ? "none"
                            : "1px solid #f0f0f0",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          justifyContent:
                            "space-between",
                          alignItems:
                            "flex-start",
                          gap:
                            "18px",
                          flexWrap:
                            "wrap",
                        }}
                      >
                        <div>
                          <p
                            style={{
                              margin:
                                0,
                              fontSize:
                                "12px",
                              color:
                                "#777",
                              fontWeight:
                                700,
                            }}
                          >
                            PAYOUT
                          </p>

                          <h3
                            style={{
                              margin:
                                "5px 0 0",
                              fontSize:
                                "23px",
                            }}
                          >
                            {payout.currency ===
                            "GHS"
                              ? "GH₵"
                              : payout.currency}{" "}
                            {formatMoney(
                              payout.amount
                            )}
                          </h3>

                          <p
                            style={{
                              margin:
                                "6px 0 0",
                              color:
                                "#666",
                            }}
                          >
                            {formatMethod(
                              payout
                            )}
                          </p>
                        </div>

                        <span
                          style={{
                            padding:
                              "7px 11px",
                            borderRadius:
                              "999px",
                            background:
                              statusStyle.background,
                            color:
                              statusStyle.color,
                            fontSize:
                              "12px",
                            fontWeight:
                              700,
                          }}
                        >
                          {getStatusLabel(
                            payout.status
                          )}
                        </span>
                      </div>

                      <div
                        style={{
                          display:
                            "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(180px, 1fr))",
                          gap:
                            "12px",
                          marginTop:
                            "18px",
                        }}
                      >
                        <div
                          style={{
                            padding:
                              "12px",
                            borderRadius:
                              "10px",
                            background:
                              "#f9fafb",
                          }}
                        >
                          <span
                            style={{
                              display:
                                "block",
                              fontSize:
                                "11px",
                              color:
                                "#777",
                              marginBottom:
                                "4px",
                            }}
                          >
                            Date
                          </span>

                          <strong
                            style={{
                              fontSize:
                                "13px",
                            }}
                          >
                            {formatDate(
                              payout.created_at
                            )}
                          </strong>
                        </div>

                        <div
                          style={{
                            padding:
                              "12px",
                            borderRadius:
                              "10px",
                            background:
                              "#f9fafb",
                          }}
                        >
                          <span
                            style={{
                              display:
                                "block",
                              fontSize:
                                "11px",
                              color:
                                "#777",
                              marginBottom:
                                "4px",
                            }}
                          >
                            Reference
                          </span>

                          <strong
                            style={{
                              fontSize:
                                "12px",
                              wordBreak:
                                "break-word",
                            }}
                          >
                            {
                              payout.reference
                            }
                          </strong>
                        </div>

                        {payout.transfer_code && (
                          <div
                            style={{
                              padding:
                                "12px",
                              borderRadius:
                                "10px",
                              background:
                                "#f9fafb",
                            }}
                          >
                            <span
                              style={{
                                display:
                                  "block",
                                fontSize:
                                  "11px",
                                color:
                                  "#777",
                                marginBottom:
                                  "4px",
                              }}
                            >
                              Transfer Code
                            </span>

                            <strong
                              style={{
                                fontSize:
                                  "12px",
                                wordBreak:
                                  "break-word",
                              }}
                            >
                              {
                                payout.transfer_code
                              }
                            </strong>
                          </div>
                        )}
                      </div>

                      {payout.status.toLowerCase() ===
                        "pending" && (
                        <div
                          style={{
                            marginTop:
                              "14px",
                            padding:
                              "12px 14px",
                            borderRadius:
                              "10px",
                            background:
                              "#fffbeb",
                            border:
                              "1px solid #fde68a",
                            color:
                              "#92400e",
                            fontSize:
                              "13px",
                            lineHeight:
                              1.5,
                          }}
                        >
                          Your payout has been
                          submitted and is still
                          being processed.
                        </div>
                      )}

                      {payout.status.toLowerCase() ===
                        "success" && (
                        <div
                          style={{
                            marginTop:
                              "14px",
                            padding:
                              "12px 14px",
                            borderRadius:
                              "10px",
                            background:
                              "#f0fdf4",
                            border:
                              "1px solid #bbf7d0",
                            color:
                              "#166534",
                            fontSize:
                              "13px",
                            lineHeight:
                              1.5,
                          }}
                        >
                          This payout was successfully
                          processed.
                        </div>
                      )}

                      {payout.status.toLowerCase() ===
                        "failed" && (
                        <div
                          style={{
                            marginTop:
                              "14px",
                            padding:
                              "12px 14px",
                            borderRadius:
                              "10px",
                            background:
                              "#fef2f2",
                            border:
                              "1px solid #fecaca",
                            color:
                              "#991b1b",
                            fontSize:
                              "13px",
                            lineHeight:
                              1.5,
                          }}
                        >
                          This payout failed. The
                          associated eligible earnings
                          should be available for another
                          withdrawal attempt.
                        </div>
                      )}

                      {payout.status.toLowerCase() ===
                        "reversed" && (
                        <div
                          style={{
                            marginTop:
                              "14px",
                            padding:
                              "12px 14px",
                            borderRadius:
                              "10px",
                            background:
                              "#fef2f2",
                            border:
                              "1px solid #fecaca",
                            color:
                              "#991b1b",
                            fontSize:
                              "13px",
                            lineHeight:
                              1.5,
                          }}
                        >
                          This payout was reversed.
                          The associated eligible
                          earnings should be available
                          for another withdrawal attempt.
                        </div>
                      )}
                    </article>
                  );
                }
              )}
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}

        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginTop: "20px",
          }}
        >
          <span
            style={{
              fontSize: "12px",
              color: "#777",
            }}
          >
            Failed/reversed payouts:
            {" "}
            GH₵{" "}
            {formatMoney(
              totalFailedOrReversed
            )}
          </span>

          <button
            type="button"
            onClick={() =>
              router.push(
                "/owner/payout"
              )
            }
          >
            💰 Withdraw Earnings
          </button>
        </div>
      </div>
    </main>
  );
}