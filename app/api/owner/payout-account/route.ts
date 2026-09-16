import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PayoutMethod = "momo" | "bank";

type PaystackBank = {
  name: string;
  code: string;
  active: boolean;
  currency: string;
  type: string;
};

export async function POST(request: Request) {
  try {
    /*
     * =====================================================
     * AUTHENTICATE USER
     * =====================================================
     */

    const authHeader =
      request.headers.get("Authorization");

    const accessToken =
      authHeader?.replace(
        "Bearer ",
        ""
      );

    if (!accessToken) {
      return NextResponse.json(
        {
          error:
            "You must be logged in.",
        },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: userError,
    } =
      await supabase.auth.getUser(
        accessToken
      );

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          error:
            "Your login session is invalid.",
        },
        { status: 401 }
      );
    }

    /*
     * =====================================================
     * VERIFY OWNER
     * =====================================================
     */

    const {
      data: profile,
      error: profileError,
    } =
      await supabaseAdmin
        .from("profiles")
        .select(
          "account_type, full_name"
        )
        .eq(
          "id",
          user.id
        )
        .single();

    if (
      profileError ||
      !profile ||
      profile.account_type !==
        "owner"
    ) {
      return NextResponse.json(
        {
          error:
            "Only property owners can connect a payout account.",
        },
        { status: 403 }
      );
    }

    /*
     * =====================================================
     * READ REQUEST
     * =====================================================
     */

    let body: any;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error:
            "Invalid request body.",
        },
        { status: 400 }
      );
    }

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

    if (
      payout_method !==
        "momo" &&
      payout_method !==
        "bank"
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid payout method.",
        },
        { status: 400 }
      );
    }

    const accountName =
      String(
        name || ""
      ).trim();

    if (!accountName) {
      return NextResponse.json(
        {
          error:
            "Account name is required.",
        },
        { status: 400 }
      );
    }

    /*
     * =====================================================
     * PAYSTACK SECRET
     * =====================================================
     */

    const secretKey =
      process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      return NextResponse.json(
        {
          error:
            "Paystack secret key is not configured.",
        },
        { status: 500 }
      );
    }

    /*
     * =====================================================
     * PREPARE RECIPIENT DATA
     * =====================================================
     */

    let recipientType = "";
    let accountNumber = "";
    let recipientBankCode = "";
    let savedMomoNetwork:
      | string
      | null = null;
    let savedMomoNumber:
      | string
      | null = null;
    let savedBankName:
      | string
      | null = null;
    let savedBankAccountName:
      | string
      | null = null;
    let savedBankAccountNumber:
      | string
      | null = null;

    /*
     * =====================================================
     * MOBILE MONEY
     * =====================================================
     */

    if (
      payout_method ===
      "momo"
    ) {
      const network =
        String(
          momo_network ||
            ""
        ).trim();

      const phone =
        String(
          momo_number ||
            ""
        ).trim();

      if (
        !network ||
        !phone
      ) {
        return NextResponse.json(
          {
            error:
              "MoMo network and phone number are required.",
          },
          { status: 400 }
        );
      }

      const networkMap: Record<
        string,
        string
      > = {
        MTN: "MTN",
        Telecel: "VOD",
        AirtelTigo: "ATL",
      };

      const bankCode =
        networkMap[
          network
        ];

      if (!bankCode) {
        return NextResponse.json(
          {
            error:
              "Unsupported MoMo network.",
          },
          { status: 400 }
        );
      }

      /*
       * Basic Ghana mobile number validation.
       * Accepts 10-digit local numbers such as 0241234567.
       */
      if (
        !/^0\d{9}$/.test(
          phone
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Please enter a valid Ghanaian MoMo number, for example 0241234567.",
          },
          { status: 400 }
        );
      }

      /*
       * Confirm the requested telco is currently supported
       * by Paystack for GHS mobile money.
       */
      const banksResponse =
        await fetch(
          "https://api.paystack.co/bank?currency=GHS&type=mobile_money",
          {
            method: "GET",
            headers: {
              Authorization:
                `Bearer ${secretKey}`,
            },
          }
        );

      const banksData =
        await banksResponse.json();

      if (
        !banksResponse.ok ||
        !banksData?.status
      ) {
        console.error(
          "Paystack mobile money bank lookup error:",
          banksData
        );

        return NextResponse.json(
          {
            error:
              "Could not verify the selected MoMo network with Paystack.",
          },
          { status: 502 }
        );
      }

      const supportedBanks =
        (banksData.data ||
          []) as PaystackBank[];

      const supportedNetwork =
        supportedBanks.find(
          (bank) =>
            bank.code ===
              bankCode &&
            bank.active ===
              true
        );

      if (
        !supportedNetwork
      ) {
        return NextResponse.json(
          {
            error:
              "The selected MoMo network is not currently available for payouts.",
          },
          { status: 400 }
        );
      }

      recipientType =
        "mobile_money";

      accountNumber =
        phone;

      recipientBankCode =
        bankCode;

      savedMomoNetwork =
        network;

      savedMomoNumber =
        phone;
    }

    /*
     * =====================================================
     * BANK ACCOUNT
     * =====================================================
     */

    if (
      payout_method ===
      "bank"
    ) {
      const requestedBankCode =
        String(
          bank_code ||
            ""
        ).trim();

      const requestedBankName =
        String(
          bank_name ||
            ""
        ).trim();

      const requestedAccountName =
        String(
          bank_account_name ||
            accountName
        ).trim();

      const requestedAccountNumber =
        String(
          bank_account_number ||
            ""
        ).trim();

      if (
        !requestedBankCode ||
        !requestedAccountNumber
      ) {
        return NextResponse.json(
          {
            error:
              "Bank code and account number are required.",
          },
          { status: 400 }
        );
      }

      if (
        !/^\d+$/.test(
          requestedAccountNumber
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Bank account number must contain digits only.",
          },
          { status: 400 }
        );
      }

      /*
       * Fetch Ghana banks from Paystack and verify that the
       * supplied bank code actually exists.
       */
      const banksResponse =
        await fetch(
          "https://api.paystack.co/bank?currency=GHS",
          {
            method: "GET",
            headers: {
              Authorization:
                `Bearer ${secretKey}`,
            },
          }
        );

      const banksData =
        await banksResponse.json();

      if (
        !banksResponse.ok ||
        !banksData?.status
      ) {
        console.error(
          "Paystack bank lookup error:",
          banksData
        );

        return NextResponse.json(
          {
            error:
              "Could not verify the selected bank with Paystack.",
          },
          { status: 502 }
        );
      }

      const supportedBanks =
        (banksData.data ||
          []) as PaystackBank[];

      const matchedBank =
        supportedBanks.find(
          (bank) =>
            bank.code ===
              requestedBankCode &&
            bank.currency ===
              "GHS" &&
            bank.active ===
              true
        );

      if (!matchedBank) {
        return NextResponse.json(
          {
            error:
              "The supplied bank code is invalid or the bank is not currently available.",
          },
          { status: 400 }
        );
      }

      recipientType =
        "ghipss";

      accountNumber =
        requestedAccountNumber;

      recipientBankCode =
        matchedBank.code;

      savedBankName =
        matchedBank.name ||
        requestedBankName ||
        null;

      savedBankAccountName =
        requestedAccountName ||
        null;

      savedBankAccountNumber =
        requestedAccountNumber;
    }

    /*
     * =====================================================
     * CREATE PAYSTACK RECIPIENT
     * =====================================================
     */

    const paystackResponse =
      await fetch(
        "https://api.paystack.co/transferrecipient",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${secretKey}`,
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            type:
              recipientType,
            name:
              accountName,
            account_number:
              accountNumber,
            bank_code:
              recipientBankCode,
            currency:
              "GHS",
          }),
        }
      );

    const paystackData =
      await paystackResponse.json();

    if (
      !paystackResponse.ok ||
      !paystackData?.status ||
      !paystackData?.data
    ) {
      console.error(
        "Paystack recipient error:",
        paystackData
      );

      return NextResponse.json(
        {
          error:
            paystackData?.message ||
            "Could not create the Paystack payout recipient.",
        },
        { status: 400 }
      );
    }

    const recipient =
      paystackData.data;

    const recipientCode =
      recipient?.recipient_code;

    if (!recipientCode) {
      return NextResponse.json(
        {
          error:
            "Paystack did not return a recipient code.",
        },
        { status: 400 }
      );
    }

    /*
     * =====================================================
     * VERIFY CREATED RECIPIENT
     * =====================================================
     *
     * Fetch the recipient back from Paystack and confirm
     * that it is active before storing it as usable.
     */

    const verifyResponse =
      await fetch(
        `https://api.paystack.co/transferrecipient/${encodeURIComponent(
          recipientCode
        )}`,
        {
          method: "GET",
          headers: {
            Authorization:
              `Bearer ${secretKey}`,
          },
        }
      );

    const verifyData =
      await verifyResponse.json();

    if (
      !verifyResponse.ok ||
      !verifyData?.status ||
      !verifyData?.data
    ) {
      console.error(
        "Paystack recipient verification error:",
        verifyData
      );

      return NextResponse.json(
        {
          error:
            "The payout recipient was created but could not be verified.",
        },
        { status: 400 }
      );
    }

    const verifiedRecipient =
      verifyData.data;

    if (
      verifiedRecipient.active !==
      true
    ) {
      return NextResponse.json(
        {
          error:
            "Paystack created the recipient, but it is not currently active.",
        },
        { status: 400 }
      );
    }

    /*
     * =====================================================
     * SAVE PAYOUT ACCOUNT
     * =====================================================
     */

    const now =
      new Date().toISOString();

    const {
      error:
        databaseError,
    } =
      await supabaseAdmin
        .from(
          "owner_payment_accounts"
        )
        .upsert(
          {
            owner_id:
              user.id,

            payout_method:
              payout_method,

            momo_network:
              payout_method ===
              "momo"
                ? savedMomoNetwork
                : null,

            momo_number:
              payout_method ===
              "momo"
                ? savedMomoNumber
                : null,

            bank_name:
              payout_method ===
              "bank"
                ? savedBankName
                : null,

            bank_account_name:
              payout_method ===
              "bank"
                ? savedBankAccountName
                : null,

            bank_account_number:
              payout_method ===
              "bank"
                ? savedBankAccountNumber
                : null,

            paystack_recipient_code:
              recipientCode,

            status:
              "active",

            recipient_created_at:
              now,

            last_verified_at:
              now,

            updated_at:
              now,
          },
          {
            onConflict:
              "owner_id",
          }
        );

    if (
      databaseError
    ) {
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

    /*
     * =====================================================
     * SUCCESS
     * =====================================================
     */

    return NextResponse.json({
      success: true,
      message:
        "Payout account connected successfully.",
      payoutMethod:
        payout_method,
      recipientCode,
    });
  } catch (error) {
    console.error(
      "Payout account error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong while connecting your payout account.",
      },
      { status: 500 }
    );
  }
}