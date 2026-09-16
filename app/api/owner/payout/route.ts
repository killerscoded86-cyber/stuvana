import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type BookingForPayout = {
  id: number;
  owner_amount: number | null;
  currency: string | null;
  status: string;
  payout_id: number | null;
};

export async function POST(request: Request) {
  let payoutId: number | null = null;
  let paystackAccepted = false;

  try {
    /*
     * =====================================================
     * AUTHENTICATE OWNER
     * =====================================================
     */

    const authHeader = request.headers.get("Authorization");

    const accessToken = authHeader?.replace("Bearer ", "");

    if (!accessToken) {
      return NextResponse.json(
        {
          error: "You must be logged in.",
        },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        {
          error: "Your login session is invalid.",
        },
        { status: 401 }
      );
    }

    /*
     * =====================================================
     * VERIFY OWNER ACCOUNT
     * =====================================================
     */

    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
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
          error: "Only property owners can request payouts.",
        },
        { status: 403 }
      );
    }

    /*
     * =====================================================
     * LOAD PAYOUT ACCOUNT
     * =====================================================
     */

    const {
      data: payoutAccount,
      error: payoutAccountError,
    } = await supabaseAdmin
      .from("owner_payment_accounts")
      .select(
        "paystack_recipient_code, payout_method, status"
      )
      .eq("owner_id", user.id)
      .maybeSingle();

    if (payoutAccountError) {
      console.error(
        "Payout account lookup error:",
        payoutAccountError
      );

      return NextResponse.json(
        {
          error: "Could not load your payout account.",
        },
        { status: 500 }
      );
    }

    if (!payoutAccount || !payoutAccount.paystack_recipient_code) {
      return NextResponse.json(
        {
          error:
            "Please connect your Bank or MoMo payout account first.",
        },
        { status: 400 }
      );
    }

    if (
      String(payoutAccount.status).toLowerCase() !== "active"
    ) {
      return NextResponse.json(
        {
          error: "Your payout account is not active.",
        },
        { status: 400 }
      );
    }

    /*
     * =====================================================
     * LOAD AVAILABLE BOOKINGS
     * =====================================================
     *
     * These are paid bookings whose earnings have not
     * already been assigned to a payout.
     */

    const {
      data: bookings,
      error: bookingsError,
    } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, owner_amount, currency, status, payout_id"
      )
      .eq("owner_id", user.id)
      .eq("status", "paid")
      .is("payout_id", null);

    if (bookingsError) {
      console.error(
        "Bookings lookup error:",
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

    const availableBookings =
      (bookings || []) as BookingForPayout[];

    if (availableBookings.length === 0) {
      return NextResponse.json(
        {
          error:
            "You do not have any available earnings to withdraw yet.",
        },
        { status: 400 }
      );
    }

    /*
     * =====================================================
     * VALIDATE CURRENCIES
     * =====================================================
     */

    const invalidCurrency = availableBookings.find(
      (booking) =>
        booking.currency &&
        booking.currency.toUpperCase() !== "GHS"
    );

    if (invalidCurrency) {
      return NextResponse.json(
        {
          error:
            "Your available bookings contain an unsupported payout currency.",
        },
        { status: 400 }
      );
    }

    /*
     * =====================================================
     * CALCULATE PAYOUT
     * =====================================================
     */

    const amount = availableBookings.reduce(
      (total, booking) =>
        total + Number(booking.owner_amount || 0),
      0
    );

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        {
          error: "Your available payout amount is invalid.",
        },
        { status: 400 }
      );
    }

    const paystackAmount = Math.round(amount * 100);

    if (paystackAmount < 1) {
      return NextResponse.json(
        {
          error: "The payout amount is too small.",
        },
        { status: 400 }
      );
    }

    /*
     * =====================================================
     * CREATE PAYOUT RECORD
     * =====================================================
     */

    const reference =
      `stuvana-payout-${crypto.randomUUID()}`;

    const {
      data: payout,
      error: payoutInsertError,
    } = await supabaseAdmin
      .from("owner_payouts")
      .insert({
        owner_id: user.id,
        amount,
        currency: "GHS",
        recipient_code:
          payoutAccount.paystack_recipient_code,
        payout_method: payoutAccount.payout_method,
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
          error: "Could not create the payout request.",
        },
        { status: 500 }
      );
    }

    payoutId = payout.id;

    /*
     * =====================================================
     * RESERVE BOOKINGS
     * =====================================================
     *
     * Each booking is updated only when payout_id is still
     * null. This prevents an already-reserved booking from
     * being silently reassigned.
     */

    const bookingIds = availableBookings.map(
      (booking) => booking.id
    );

    const {
      data: reservedBookings,
      error: bookingUpdateError,
    } = await supabaseAdmin
      .from("bookings")
      .update({
        payout_id: payout.id,
      })
      .in("id", bookingIds)
      .eq("owner_id", user.id)
      .eq("status", "paid")
      .is("payout_id", null)
      .select("id");

    if (bookingUpdateError) {
      console.error(
        "Booking payout reservation error:",
        bookingUpdateError
      );

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
            "Could not reserve the earnings for payout. Please try again.",
        },
        { status: 409 }
      );
    }

    const reservedCount = reservedBookings?.length || 0;

    /*
     * If another request reserved one or more of the
     * bookings first, do not send a partial payout.
     */

    if (reservedCount !== bookingIds.length) {
      console.error(
        "Booking reservation conflict:",
        {
          expected: bookingIds.length,
          reserved: reservedCount,
          payoutId: payout.id,
        }
      );

      await supabaseAdmin
        .from("bookings")
        .update({
          payout_id: null,
        })
        .eq("payout_id", payout.id);

      await supabaseAdmin
        .from("owner_payouts")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payout.id);

      payoutId = null;

      return NextResponse.json(
        {
          error:
            "Another payout request is already processing some of your earnings. Please refresh and try again.",
        },
        { status: 409 }
      );
    }

    /*
     * =====================================================
     * PAYSTACK CONFIGURATION
     * =====================================================
     */

    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      await supabaseAdmin
        .from("owner_payouts")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payout.id);

      await supabaseAdmin
        .from("bookings")
        .update({
          payout_id: null,
        })
        .eq("payout_id", payout.id);

      payoutId = null;

      return NextResponse.json(
        {
          error: "Paystack secret key is not configured.",
        },
        { status: 500 }
      );
    }

    /*
     * =====================================================
     * INITIATE PAYSTACK TRANSFER
     * =====================================================
     */

    let paystackResponse: Response;
    let paystackData: any;

    try {
      paystackResponse = await fetch(
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

      paystackData = await paystackResponse.json();
    } catch (paystackError) {
      console.error(
        "Paystack network error:",
        paystackError
      );

      await supabaseAdmin
        .from("owner_payouts")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payout.id);

      await supabaseAdmin
        .from("bookings")
        .update({
          payout_id: null,
        })
        .eq("payout_id", payout.id);

      payoutId = null;

      return NextResponse.json(
        {
          error:
            "Could not connect to Paystack. Your earnings were released and you can try again.",
        },
        { status: 502 }
      );
    }

    /*
     * Paystack returned an API response. A successful HTTP
     * response with a valid transfer object means the transfer
     * request was accepted/queued, so we must not release the
     * reserved bookings if a later database update fails.
     */

    if (
      paystackResponse.ok &&
      paystackData?.status &&
      paystackData?.data
    ) {
      paystackAccepted = true;
    }

    /*
     * =====================================================
     * HANDLE PAYSTACK RESPONSE
     * =====================================================
     */

    if (
      !paystackResponse.ok ||
      !paystackData?.status ||
      !paystackData?.data
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

      await supabaseAdmin
        .from("bookings")
        .update({
          payout_id: null,
        })
        .eq("payout_id", payout.id);

      payoutId = null;

      return NextResponse.json(
        {
          error:
            paystackData?.message ||
            "Paystack could not process the payout.",
        },
        { status: 400 }
      );
    }

    const transfer = paystackData.data;

    const transferStatus = String(
      transfer?.status || "pending"
    ).toLowerCase();

    /*
     * Paystack transfer creation can return a pending
     * transfer. Final success/failure should be handled
     * by the transfer webhook or transfer verification.
     */

    const normalizedStatus =
      transferStatus === "success"
        ? "success"
        : transferStatus === "failed"
        ? "failed"
        : transferStatus === "reversed"
        ? "reversed"
        : "pending";

    const {
      error: payoutUpdateError,
    } = await supabaseAdmin
      .from("owner_payouts")
      .update({
        status: normalizedStatus,
        transfer_code:
          transfer?.transfer_code || null,
        paystack_transfer_id:
          transfer?.id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payout.id);

    if (payoutUpdateError) {
      console.error(
        "Payout status update error:",
        payoutUpdateError
      );

      /*
       * Paystack already accepted the transfer. Keep the
       * bookings reserved to avoid a duplicate withdrawal.
       */

      return NextResponse.json(
        {
          error:
            "The payout was submitted, but STUVANA could not update its payout record. Please contact support before trying another withdrawal.",
          payoutId: payout.id,
          reference,
        },
        { status: 500 }
      );
    }

    /*
     * Do not release bookings for a successful or pending
     * Paystack transfer. They remain attached to this payout
     * until the payout reaches a final state.
     */

    if (
      normalizedStatus === "failed" ||
      normalizedStatus === "reversed"
    ) {
      await supabaseAdmin
        .from("bookings")
        .update({
          payout_id: null,
        })
        .eq("payout_id", payout.id);

      payoutId = null;
    }

    /*
     * =====================================================
     * RESPONSE
     * =====================================================
     */

    if (normalizedStatus === "success") {
      return NextResponse.json({
        success: true,
        message: "Your payout was sent successfully.",
        payoutId: payout.id,
        amount,
        status: "success",
        reference,
      });
    }

    if (
      normalizedStatus === "failed" ||
      normalizedStatus === "reversed"
    ) {
      return NextResponse.json(
        {
          error:
            normalizedStatus === "reversed"
              ? "Paystack reversed the payout. Your earnings have been released so you can try again."
              : "Paystack could not complete the payout. Your earnings have been released so you can try again.",
          payoutId: payout.id,
          amount,
          status: normalizedStatus,
          reference,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Your payout has been submitted and is being processed.",
      payoutId: payout.id,
      amount,
      status: "pending",
      reference,
    });
  } catch (error) {
    console.error("Owner payout error:", error);

    /*
     * If Paystack may already have accepted the transfer,
     * do NOT release the bookings. They stay reserved for
     * this payout and can be reconciled through the webhook
     * or transfer verification.
     *
     * If Paystack was not accepted, safely fail the payout
     * and release the reserved bookings.
     */

    if (payoutId) {
      try {
        if (!paystackAccepted) {
          await supabaseAdmin
            .from("owner_payouts")
            .update({
              status: "failed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", payoutId)
            .eq("status", "pending");

          await supabaseAdmin
            .from("bookings")
            .update({
              payout_id: null,
            })
            .eq("payout_id", payoutId);
        } else {
          await supabaseAdmin
            .from("owner_payouts")
            .update({
              status: "pending",
              updated_at: new Date().toISOString(),
            })
            .eq("id", payoutId);
        }
      } catch (cleanupError) {
        console.error(
          "Payout cleanup error:",
          cleanupError
        );
      }
    }

    return NextResponse.json(
      {
        error:
          paystackAccepted
            ? "The payout may already have been accepted by Paystack, but STUVANA could not finish updating the payout record. Please contact support before trying another withdrawal."
            : "Something went wrong while processing your payout.",
      },
      { status: 500 }
    );
  }
}
