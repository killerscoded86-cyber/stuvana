import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const accessToken = authHeader?.replace("Bearer ", "");

    if (!accessToken) {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Your login session is invalid." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .single();

    if (
      profileError ||
      !profile ||
      profile.account_type !== "owner"
    ) {
      return NextResponse.json(
        {
          error:
            "Only property owners can connect a payout account.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const {
      payout_method,
      name,
      momo_network,
      momo_number,
      bank_code,
      bank_name,
      bank_account_name,
      bank_account_number,
    } = body;

    if (!payout_method || !name?.trim()) {
      return NextResponse.json(
        {
          error: "Payout method and name are required.",
        },
        { status: 400 }
      );
    }

    let recipientType = "";
    let accountNumber = "";
    let recipientBankCode = "";

    if (payout_method === "momo") {
      if (!momo_network || !momo_number?.trim()) {
        return NextResponse.json(
          {
            error:
              "MoMo network and phone number are required.",
          },
          { status: 400 }
        );
      }

      const allowedNetworks = [
        "MTN",
        "Telecel",
        "AirtelTigo",
      ];

      if (!allowedNetworks.includes(momo_network)) {
        return NextResponse.json(
          { error: "Invalid MoMo network." },
          { status: 400 }
        );
      }

      const networkCode =
        momo_network === "MTN"
          ? "MTN"
          : momo_network === "Telecel"
          ? "VOD"
          : "ATL";

      recipientType = "mobile_money";
      accountNumber = momo_number.trim();
      recipientBankCode = networkCode;
    } else if (payout_method === "bank") {
      if (
        !bank_code?.trim() ||
        !bank_account_number?.trim()
      ) {
        return NextResponse.json(
          {
            error:
              "Bank code and account number are required.",
          },
          { status: 400 }
        );
      }

      recipientType = "ghipss";
      accountNumber = bank_account_number.trim();
      recipientBankCode = bank_code.trim();
    } else {
      return NextResponse.json(
        { error: "Invalid payout method." },
        { status: 400 }
      );
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      return NextResponse.json(
        {
          error:
            "Paystack secret key is not configured.",
        },
        { status: 500 }
      );
    }

    const paystackResponse = await fetch(
      "https://api.paystack.co/transferrecipient",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: recipientType,
          name: name.trim(),
          account_number: accountNumber,
          bank_code: recipientBankCode,
          currency: "GHS",
        }),
      }
    );

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      console.error(
        "Paystack recipient error:",
        paystackData
      );

      return NextResponse.json(
        {
          error:
            paystackData.message ||
            "Could not create Paystack payout recipient.",
        },
        { status: 400 }
      );
    }

    const recipientCode =
      paystackData.data?.recipient_code;

    if (!recipientCode) {
      return NextResponse.json(
        {
          error:
            "Paystack did not return a recipient code.",
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const { error: databaseError } =
      await supabaseAdmin
        .from("owner_payment_accounts")
        .upsert(
          {
            owner_id: user.id,
            payout_method,

            momo_network:
              payout_method === "momo"
                ? momo_network
                : null,

            momo_number:
              payout_method === "momo"
                ? momo_number.trim()
                : null,

            bank_name:
              payout_method === "bank"
                ? bank_name?.trim() || null
                : null,

            bank_account_name:
              payout_method === "bank"
                ? bank_account_name?.trim() || null
                : null,

            bank_account_number:
              payout_method === "bank"
                ? bank_account_number.trim()
                : null,

            paystack_recipient_code:
              recipientCode,

            status: "active",
            recipient_created_at: now,
            last_verified_at: now,
            updated_at: now,
          },
          {
            onConflict: "owner_id",
          }
        );

    if (databaseError) {
      console.error(
        "Payout account database error:",
        databaseError
      );

      return NextResponse.json(
        {
          error:
            "Paystack connected successfully, but the payout account could not be saved.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Payout account connected successfully.",
      payoutMethod: payout_method,
      recipientCode,
    });
  } catch (error) {
    console.error(
      "Payout account error:",
      error
    );

    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}