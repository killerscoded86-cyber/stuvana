import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const { reference } = await request.json();

    if (!reference) {
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
      }
    );

    const paystackData = await response.json();

    if (!response.ok || !paystackData.status) {
      console.error("Paystack verification error:", paystackData);

      return NextResponse.json(
        { error: "Could not verify Paystack payment." },
        { status: 500 }
      );
    }

    const transaction = paystackData.data;

    if (transaction.status !== "success") {
      return NextResponse.json({
        success: false,
        status: transaction.status,
      });
    }

    const { data: booking, error: bookingError } =
      await supabaseAdmin
        .from("bookings")
        .select("*")
        .eq("paystack_reference", reference)
        .single();

    if (bookingError || !booking) {
      console.error("Booking not found:", bookingError);

      return NextResponse.json(
        { error: "STUVANA booking could not be found." },
        { status: 404 }
      );
    }

    if (booking.status === "paid") {
      return NextResponse.json({
        success: true,
        alreadyPaid: true,
        bookingId: booking.id,
      });
    }

    const expectedAmount = Math.round(
      Number(booking.amount) * 100
    );

    if (Number(transaction.amount) !== expectedAmount) {
      console.error("Payment amount mismatch.");

      return NextResponse.json(
        { error: "Payment amount does not match booking." },
        { status: 400 }
      );
    }

    const { error: updateError } =
      await supabaseAdmin
        .from("bookings")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          payment_processing_fee: 0,
        })
        .eq("id", booking.id)
        .eq("status", "pending");

    if (updateError) {
      console.error("Booking update error:", updateError);

      return NextResponse.json(
        { error: "Could not update booking." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      amount: booking.amount,
      commission: booking.commission_amount,
      ownerAmount: booking.owner_amount,
    });
  } catch (error) {
    console.error("Payment verification error:", error);

    return NextResponse.json(
      { error: "Something went wrong during verification." },
      { status: 500 }
    );
  }
}