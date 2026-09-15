import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const { reference } = await request.json();

    if (!reference || typeof reference !== "string") {
      return NextResponse.json(
        { error: "Payment reference is required." },
        { status: 400 }
      );
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      return NextResponse.json(
        { error: "Paystack secret key is not configured." },
        { status: 500 }
      );
    }

    /*
     * Find the booking first.
     * This ensures the payment reference belongs
     * to an actual STUVANA booking.
     */
    const { data: booking, error: bookingError } =
      await supabaseAdmin
        .from("bookings")
        .select("*")
        .eq("paystack_reference", reference)
        .maybeSingle();

    if (bookingError) {
      console.error(
        "Booking lookup error:",
        bookingError
      );

      return NextResponse.json(
        {
          error:
            "Could not verify the STUVANA booking.",
        },
        { status: 500 }
      );
    }

    if (!booking) {
      return NextResponse.json(
        {
          error:
            "STUVANA booking could not be found.",
        },
        { status: 404 }
      );
    }

    /*
     * Idempotency:
     * If this payment was already confirmed,
     * do not process it again.
     */
    if (booking.status === "paid") {
      return NextResponse.json({
        success: true,
        alreadyPaid: true,
        bookingId: booking.id,
        amount: booking.amount,
        paymentProcessingFee:
          booking.payment_processing_fee,
        totalAmount: booking.total_amount,
        commission: booking.commission_amount,
        ownerAmount: booking.owner_amount,
      });
    }

    /*
     * Verify the transaction directly with Paystack.
     */
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    const paystackData = await response.json();

    if (!response.ok || !paystackData.status) {
      console.error(
        "Paystack verification error:",
        paystackData
      );

      return NextResponse.json(
        {
          error:
            "Could not verify Paystack payment.",
        },
        { status: 500 }
      );
    }

    const transaction = paystackData.data;

    /*
     * Payment must actually be successful.
     */
    if (transaction.status !== "success") {
      return NextResponse.json({
        success: false,
        status: transaction.status,
      });
    }

    /*
     * The amount Paystack should have charged is
     * the student's final amount, including the
     * processing fee.
     */
    const expectedAmount = Math.round(
      Number(booking.total_amount) * 100
    );

    /*
     * Confirm the exact amount.
     */
    if (Number(transaction.amount) !== expectedAmount) {
      console.error(
        "Payment amount mismatch:",
        {
          expected: expectedAmount,
          received: Number(transaction.amount),
          reference,
        }
      );

      return NextResponse.json(
        {
          error:
            "Payment amount does not match booking.",
        },
        { status: 400 }
      );
    }

    /*
     * Confirm currency.
     */
    if (transaction.currency !== booking.currency) {
      console.error(
        "Payment currency mismatch:",
        {
          expected: booking.currency,
          received: transaction.currency,
          reference,
        }
      );

      return NextResponse.json(
        {
          error:
            "Payment currency does not match booking.",
        },
        { status: 400 }
      );
    }

    /*
     * Confirm the Paystack reference matches the
     * booking reference exactly.
     */
    if (transaction.reference !== booking.paystack_reference) {
      console.error(
        "Payment reference mismatch:",
        {
          expected: booking.paystack_reference,
          received: transaction.reference,
        }
      );

      return NextResponse.json(
        {
          error:
            "Payment reference does not match booking.",
        },
        { status: 400 }
      );
    }

    /*
     * Mark the booking as paid.
     *
     * The status = pending condition prevents a
     * second request from changing the booking
     * after it has already been paid.
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
        .select("*")
        .maybeSingle();

    if (updateError) {
      console.error(
        "Booking update error:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "Could not update booking.",
        },
        { status: 500 }
      );
    }

    /*
     * Another request may have confirmed the payment
     * at almost the same time.
     *
     * In that case, return the already-paid booking
     * rather than treating it as a failure.
     */
    if (!updatedBooking) {
      const { data: latestBooking } =
        await supabaseAdmin
          .from("bookings")
          .select("*")
          .eq("id", booking.id)
          .maybeSingle();

      if (latestBooking?.status === "paid") {
        return NextResponse.json({
          success: true,
          alreadyPaid: true,
          bookingId: latestBooking.id,
          amount: latestBooking.amount,
          paymentProcessingFee:
            latestBooking.payment_processing_fee,
          totalAmount:
            latestBooking.total_amount,
          commission:
            latestBooking.commission_amount,
          ownerAmount:
            latestBooking.owner_amount,
        });
      }

      return NextResponse.json(
        {
          error:
            "Could not confirm payment status.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      bookingId: updatedBooking.id,
      amount: updatedBooking.amount,
      paymentProcessingFee:
        updatedBooking.payment_processing_fee,
      totalAmount:
        updatedBooking.total_amount,
      commission:
        updatedBooking.commission_amount,
      ownerAmount:
        updatedBooking.owner_amount,
    });
  } catch (error) {
    console.error(
      "Payment verification error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong during verification.",
      },
      { status: 500 }
    );
  }
}