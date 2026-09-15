import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      console.error("Paystack secret key is not configured.");

      return NextResponse.json(
        { error: "Server configuration error." },
        { status: 500 }
      );
    }

    /*
     * Read the raw request body.
     * We must use the raw body when verifying
     * Paystack's webhook signature.
     */
    const rawBody = await request.text();

    const signature = request.headers.get(
      "x-paystack-signature"
    );

    if (!signature) {
      console.error(
        "Missing Paystack webhook signature."
      );

      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    /*
     * Generate the HMAC SHA512 signature using
     * the Paystack secret key.
     */
    const expectedSignature = crypto
      .createHmac("sha512", secretKey)
      .update(rawBody)
      .digest("hex");

    /*
     * Compare signatures safely.
     */
    const signaturesMatch =
      signature.length === expectedSignature.length &&
      crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

    if (!signaturesMatch) {
      console.error(
        "Invalid Paystack webhook signature."
      );

      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    /*
     * Signature is valid, so parse the event.
     */
    let event;

    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Invalid webhook payload." },
        { status: 400 }
      );
    }

    console.log(
      "Paystack webhook received:",
      event.event
    );

    /*
     * We currently only need successful charges.
     */
    if (event.event !== "charge.success") {
      return NextResponse.json({
        received: true,
      });
    }

    const transaction = event.data;

    if (!transaction) {
      return NextResponse.json(
        { error: "Invalid transaction data." },
        { status: 400 }
      );
    }

    const reference = transaction.reference;

    if (!reference) {
      return NextResponse.json(
        { error: "Payment reference is missing." },
        { status: 400 }
      );
    }

    /*
     * Find the STUVANA booking using the Paystack
     * reference.
     */
    const { data: booking, error: bookingError } =
      await supabaseAdmin
        .from("bookings")
        .select("*")
        .eq("paystack_reference", reference)
        .maybeSingle();

    if (bookingError) {
      console.error(
        "Webhook booking lookup error:",
        bookingError
      );

      return NextResponse.json(
        { error: "Could not find booking." },
        { status: 500 }
      );
    }

    if (!booking) {
      console.error(
        "No STUVANA booking found for reference:",
        reference
      );

      /*
       * Return 200 so Paystack does not repeatedly
       * send an event for a reference STUVANA does
       * not recognize.
       */
      return NextResponse.json({
        received: true,
      });
    }

    /*
     * Idempotency:
     * If the booking is already paid, do nothing.
     */
    if (booking.status === "paid") {
      return NextResponse.json({
        received: true,
        alreadyPaid: true,
        bookingId: booking.id,
      });
    }

    /*
     * Only successful transactions should reach
     * this point.
     */
    if (transaction.status !== "success") {
      return NextResponse.json({
        received: true,
      });
    }

    /*
     * Verify the amount.
     *
     * Paystack amounts are sent in pesewas.
     */
    const expectedAmount = Math.round(
      Number(booking.total_amount) * 100
    );

    if (Number(transaction.amount) !== expectedAmount) {
      console.error(
        "Webhook payment amount mismatch:",
        {
          reference,
          expected: expectedAmount,
          received: Number(transaction.amount),
        }
      );

      return NextResponse.json(
        { error: "Payment amount mismatch." },
        { status: 400 }
      );
    }

    /*
     * Verify currency.
     */
    if (transaction.currency !== booking.currency) {
      console.error(
        "Webhook currency mismatch:",
        {
          reference,
          expected: booking.currency,
          received: transaction.currency,
        }
      );

      return NextResponse.json(
        { error: "Payment currency mismatch." },
        { status: 400 }
      );
    }

    /*
     * Verify the Paystack reference one more time.
     */
    if (transaction.reference !== booking.paystack_reference) {
      console.error(
        "Webhook reference mismatch:",
        {
          expected: booking.paystack_reference,
          received: transaction.reference,
        }
      );

      return NextResponse.json(
        { error: "Payment reference mismatch." },
        { status: 400 }
      );
    }

    /*
     * Mark the booking as paid.
     *
     * The status = pending condition prevents
     * another webhook from processing the same
     * booking again.
     */
    const { data: updatedBooking, error: updateError } =
      await supabaseAdmin
        .from("bookings")
        .update({
          status: "paid",
          paid_at:
            transaction.paid_at ||
            new Date().toISOString(),
        })
        .eq("id", booking.id)
        .eq("status", "pending")
        .select("id, status")
        .maybeSingle();

    if (updateError) {
      console.error(
        "Webhook booking update error:",
        updateError
      );

      return NextResponse.json(
        { error: "Could not update booking." },
        { status: 500 }
      );
    }

    /*
     * If another request already marked the booking
     * as paid, that is still a successful outcome.
     */
    if (!updatedBooking) {
      const { data: latestBooking } =
        await supabaseAdmin
          .from("bookings")
          .select("id, status")
          .eq("id", booking.id)
          .maybeSingle();

      if (latestBooking?.status === "paid") {
        return NextResponse.json({
          received: true,
          alreadyPaid: true,
          bookingId: latestBooking.id,
        });
      }

      return NextResponse.json(
        { error: "Could not confirm booking status." },
        { status: 500 }
      );
    }

    console.log(
      "STUVANA booking marked as paid:",
      booking.id
    );

    return NextResponse.json({
      received: true,
      success: true,
      bookingId: updatedBooking.id,
    });
  } catch (error) {
    console.error(
      "Paystack webhook error:",
      error
    );

    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 }
    );
  }
}