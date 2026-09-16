import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const { propertyId, email } =
      await request.json();

    if (!propertyId || !email) {
      return NextResponse.json(
        {
          error:
            "Property ID and email are required.",
        },
        { status: 400 }
      );
    }

    // Get the user's access token from the request
    const authHeader =
      request.headers.get("Authorization");

    const accessToken =
      authHeader?.replace("Bearer ", "");

    if (!accessToken) {
      return NextResponse.json(
        {
          error: "You must be logged in.",
        },
        { status: 401 }
      );
    }

    // Verify the logged-in user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(
      accessToken
    );

    if (userError || !user) {
      return NextResponse.json(
        {
          error:
            "You must be logged in.",
        },
        { status: 401 }
      );
    }

    // Check the user's account type
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
      !profile
    ) {
      console.error(
        "Profile lookup error:",
        profileError
      );

      return NextResponse.json(
        {
          error:
            "Your account profile could not be verified.",
        },
        { status: 403 }
      );
    }

    // Only students can make accommodation payments
    if (
      profile.account_type !==
      "student"
    ) {
      return NextResponse.json(
        {
          error:
            "Only student accounts can book and pay for accommodation.",
        },
        { status: 403 }
      );
    }

    // Check for an existing booking for this property
    // by this student.
    const {
      data: existingBooking,
      error: existingBookingError,
    } = await supabaseAdmin
      .from("bookings")
      .select("id, status")
      .eq(
        "student_id",
        user.id
      )
      .eq(
        "property_id",
        propertyId
      )
      .in("status", [
        "pending",
        "paid",
      ])
      .maybeSingle();

    if (
      existingBookingError
    ) {
      console.error(
        "Existing booking lookup error:",
        existingBookingError
      );

      return NextResponse.json(
        {
          error:
            "Could not verify your existing bookings.",
        },
        { status: 500 }
      );
    }

    if (existingBooking) {
      if (
        existingBooking.status ===
        "paid"
      ) {
        return NextResponse.json(
          {
            error:
              "You have already booked this accommodation.",
          },
          { status: 409 }
        );
      }

      if (
        existingBooking.status ===
        "pending"
      ) {
        return NextResponse.json(
          {
            error:
              "You already have a pending payment for this accommodation. Please complete that payment before starting another one.",
          },
          { status: 409 }
        );
      }
    }

    // Get property
    const {
      data: property,
      error: propertyError,
    } = await supabaseAdmin
      .from("properties")
      .select("*")
      .eq("id", propertyId)
      .single();

    if (
      propertyError ||
      !property
    ) {
      console.error(
        "Property lookup error:",
        propertyError
      );

      return NextResponse.json(
        {
          error:
            "Property not found.",
        },
        { status: 404 }
      );
    }

    // Only approved properties can receive bookings
    if (
      property.status !==
      "approved"
    ) {
      return NextResponse.json(
        {
          error:
            "This property is not currently available for booking.",
        },
        { status: 409 }
      );
    }

    // Check available spaces
    const availableSpaces = Number(
      property.spaces
    );

    if (
      !Number.isFinite(
        availableSpaces
      ) ||
      availableSpaces <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Room unavailable at the moment.",
        },
        { status: 409 }
      );
    }

    // Get STUVANA commission
    const {
      data: settings,
      error: settingsError,
    } = await supabaseAdmin
      .from("platform_settings")
      .select(
        "commission_rate"
      )
      .eq("id", 1)
      .single();

    if (
      settingsError ||
      !settings
    ) {
      console.error(
        "Payment settings error:",
        settingsError
      );

      return NextResponse.json(
        {
          error:
            "Payment settings could not be loaded.",
        },
        { status: 500 }
      );
    }

    const commissionRate =
      Number(
        settings.commission_rate
      );

    // Owner's original accommodation price
    const amount = Number(
      property.price
    );

    // Final student-facing price
    const totalAmount = Number(
      property.display_price
    );

    if (
      !Number.isFinite(
        amount
      ) ||
      amount <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid property price.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(
        totalAmount
      ) ||
      totalAmount <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "This property does not have a valid student price.",
        },
        { status: 400 }
      );
    }

    // Convert final student price to pesewas
    const totalAmountPesewas =
      Math.round(
        totalAmount * 100
      );

    // Difference between student price
    // and owner's accommodation price
    const paymentProcessingFee =
      totalAmount - amount;

    // STUVANA commission
    const commissionAmount =
      (amount *
        commissionRate) /
      100;

    // Amount owner receives
    const ownerAmount =
      amount -
      commissionAmount;

    const reference =
      `STUVANA-${Date.now()}-${user.id.slice(
        0,
        8
      )}`;

    // Create pending booking
    const {
      error: bookingError,
    } = await supabaseAdmin
      .from("bookings")
      .insert({
        student_id:
          user.id,
        property_id:
          property.id,
        owner_id:
          property.owner_id,
        amount,
        total_amount:
          totalAmount,
        commission_rate:
          commissionRate,
        commission_amount:
          commissionAmount,
        owner_amount:
          ownerAmount,
        payment_processing_fee:
          paymentProcessingFee,
        currency: "GHS",
        status: "pending",
        paystack_reference:
          reference,
      });

    if (
      bookingError
    ) {
      console.error(
        "Booking creation error:",
        bookingError
      );

      return NextResponse.json(
        {
          error:
            "Could not create booking.",
        },
        { status: 500 }
      );
    }

    // Initialize Paystack transaction
    const paystackResponse =
      await fetch(
        "https://api.paystack.co/transaction/initialize",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            email,
            amount:
              totalAmountPesewas,
            currency: "GHS",
            reference,
            callback_url:
              `${
                process.env
                  .NEXT_PUBLIC_SITE_URL ||
                "http://localhost:3000"
              }/payment/callback`,
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
        "Paystack error:",
        paystackData
      );

      // Remove the pending booking if Paystack
      // could not initialize the payment.
      await supabaseAdmin
        .from("bookings")
        .delete()
        .eq(
          "paystack_reference",
          reference
        );

      return NextResponse.json(
        {
          error:
            "Could not initialize Paystack payment.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      authorization_url:
        paystackData.data
          .authorization_url,
      reference,
      amount,
      totalAmount,
      commissionRate,
      commissionAmount,
      ownerAmount,
    });
  } catch (error) {
    console.error(
      "Payment initialization error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong.",
      },
      { status: 500 }
    );
  }
}