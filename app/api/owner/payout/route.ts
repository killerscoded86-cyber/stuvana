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

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("account_type")
      .eq("id", user.id)
      .single();

    if (!profile || profile.account_type !== "owner") {
      return NextResponse.json(
        {
          error:
            "Only property owners can request payouts.",
        },
        { status: 403 }
      );
    }

    const { data: payoutAccount, error: payoutAccountError } =
      await supabaseAdmin
        .from("owner_payment_accounts")
        .select(
          "paystack_recipient_code, payout_method, status"
        )
        .eq("owner_id", user.id)
        .maybeSingle();

    if (
      payoutAccountError ||
      !payoutAccount ||
      !payoutAccount.paystack_recipient_code
    ) {
      return NextResponse.json(
        {
          error:
            "Please connect your Bank or MoMo payout account first.",
        },
        { status: 400 }
      );
    }

    if (payoutAccount.status !== "active") {
      return NextResponse.json(
        {
          error:
            "Your payout account is not active.",
        },
        { status: 400 }
      );
    }

    /*
     * Find paid bookings that have not already
     * been included in a payout.
     */
    const { data: bookings, error: bookingsError } =
      await supabaseAdmin
        .from("bookings")
        .select(
          "id, owner_amount, currency, status, payout_id"
        )
        .eq("owner_id", user.id)
        .eq("status", "paid")
        .is("payout_id", null);

    if (bookingsError) {
      console.error(
        "Bookings error:",
        bookingsError
      );

      return NextResponse.json(
        {
          error:
            "Could not calculate your available earnings.",
        },
        { status: 500 }
      );
    }

    if (!bookings || bookings.length === 0) {
      return NextResponse.json(
        {
          error:
            "You do not have any available earnings to withdraw yet.",
        },
        { status: 400 }
      );
    }

    const amount = bookings.reduce(
      (total, booking) =>
        total + Number(booking.owner_amount || 0),
      0
    );

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        {
          error:
            "Your available payout amount is invalid.",
        },
        { status: 400 }
      );
    }

    /*
     * Paystack expects GHS amounts in pesewas.
     */
    const paystackAmount = Math.round(amount * 100);

    if (paystackAmount < 1) {
      return NextResponse.json(
        {
          error:
            "The payout amount is too small.",
        },
        { status: 400 }
      );
    }

    const reference = `stuvana-payout-${crypto.randomUUID()}`;

    /*
     * Create our payout record before calling Paystack.
     * This gives us a permanent record of the withdrawal.
     */
    const { data: payout, error: payoutInsertError } =
      await supabaseAdmin
        .from("owner_payouts")
        .insert({
          owner_id: user.id,
          amount,
          currency: "GHS",
          recipient_code:
            payoutAccount.paystack_recipient_code,
          payout_method:
            payoutAccount.payout_method,
          reference,
          status: "pending",
        })
        .select()
        .single();

    if (payoutInsertError || !payout) {
      console.error(
        "Payout insert error:",
        payoutInsertError
      );

      return NextResponse.json(
        {
          error:
            "Could not create the payout request.",
        },
        { status: 500 }
      );
    }

    /*
     * Mark the bookings as belonging to this payout.
     */
    const bookingIds = bookings.map(
      (booking) => booking.id
    );

    const { error: bookingUpdateError } =
      await supabaseAdmin
        .from("bookings")
        .update({
          payout_id: payout.id,
        })
        .in("id", bookingIds)
        .is("payout_id", null);

    if (bookingUpdateError) {
      console.error(
        "Booking payout update error:",
        bookingUpdateError
      );

      await supabaseAdmin
        .from("owner_payouts")
        .delete()
        .eq("id", payout.id);

      return NextResponse.json(
        {
          error:
            "Could not reserve the earnings for payout.",
        },
        { status: 500 }
      );
    }

    const secretKey =
      process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      await supabaseAdmin
        .from("owner_payouts")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payout.id);

      return NextResponse.json(
        {
          error:
            "Paystack secret key is not configured.",
        },
        { status: 500 }
      );
    }

    /*
     * Initiate the actual Paystack transfer.
     */
    const paystackResponse = await fetch(
      "https://api.paystack.co/transfer",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "balance",
          amount: paystackAmount,
          recipient:
            payoutAccount.paystack_recipient_code,
          reference,
          reason: "STUVANA property owner payout",
          currency: "GHS",
        }),
      }
    );

    const paystackData =
      await paystackResponse.json();

    if (
      !paystackResponse.ok ||
      !paystackData.status
    ) {
      console.error(
        "Paystack transfer error:",
        paystackData
      );

      await supabaseAdmin
        .from("owner_payouts")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payout.id);

      /*
       * Release the bookings so the owner can
       * try the payout again.
       */
      await supabaseAdmin
        .from("bookings")
        .update({
          payout_id: null,
        })
        .eq("payout_id", payout.id);

      return NextResponse.json(
        {
          error:
            paystackData.message ||
            "Paystack could not process the payout.",
        },
        { status: 400 }
      );
    }

    const transfer = paystackData.data;

    const transferStatus =
      transfer?.status || "pending";

    await supabaseAdmin
      .from("owner_payouts")
      .update({
        status:
          transferStatus === "success"
            ? "success"
            : "pending",
        transfer_code:
          transfer?.transfer_code || null,
        paystack_transfer_id:
          transfer?.id || null,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", payout.id);

    return NextResponse.json({
      success: true,
      message:
        transferStatus === "success"
          ? "Your payout was sent successfully."
          : "Your payout has been submitted and is being processed.",
      payoutId: payout.id,
      amount,
      status:
        transferStatus === "success"
          ? "success"
          : "pending",
      reference,
    });
  } catch (error) {
    console.error(
      "Owner payout error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong while processing your payout.",
      },
      { status: 500 }
    );
  }
}