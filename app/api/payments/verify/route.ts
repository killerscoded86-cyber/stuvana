import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";

async function createOwnerNotification({
  ownerId,
  propertyId,
  bookingId,
  type,
  title,
  message,
}: {
  ownerId: string;
  propertyId: number;
  bookingId?: number | null;
  type: string;
  title: string;
  message: string;
}) {
  try {
    let query = supabaseAdmin
      .from("owner_notifications")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("property_id", propertyId)
      .eq("type", type)
      .limit(1);

    if (bookingId) {
      query = query.eq("booking_id", bookingId);
    } else {
      query = query.is("booking_id", null);
    }

    const {
      data: existingNotification,
      error: existingError,
    } = await query.maybeSingle();

    if (existingError) {
      console.error(
        "Notification duplicate check error:",
        existingError
      );
      return;
    }

    if (existingNotification) {
      return;
    }

    const { error: notificationError } =
      await supabaseAdmin
        .from("owner_notifications")
        .insert({
          owner_id: ownerId,
          property_id: propertyId,
          booking_id: bookingId || null,
          type,
          title,
          message,
          is_read: false,
        });

    if (notificationError) {
      console.error(
        "Owner notification creation error:",
        notificationError
      );
    }
  } catch (error) {
    console.error(
      "Owner notification exception:",
      error
    );
  }
}

async function createStudentNotification({
  studentId,
  propertyId,
  bookingId,
  type,
  title,
  message,
}: {
  studentId: string;
  propertyId: number;
  bookingId?: number | null;
  type: string;
  title: string;
  message: string;
}) {
  try {
    let query = supabaseAdmin
      .from("student_notifications")
      .select("id")
      .eq("student_id", studentId)
      .eq("property_id", propertyId)
      .eq("type", type)
      .limit(1);

    if (bookingId) {
      query = query.eq("booking_id", bookingId);
    } else {
      query = query.is("booking_id", null);
    }

    const {
      data: existingNotification,
      error: existingError,
    } = await query.maybeSingle();

    if (existingError) {
      console.error(
        "Student notification duplicate check error:",
        existingError
      );
      return;
    }

    if (existingNotification) {
      return;
    }

    const { error: notificationError } =
      await supabaseAdmin
        .from("student_notifications")
        .insert({
          student_id: studentId,
          property_id: propertyId,
          booking_id: bookingId || null,
          type,
          title,
          message,
          is_read: false,
        });

    if (notificationError) {
      console.error(
        "Student notification creation error:",
        notificationError
      );
    }
  } catch (error) {
    console.error(
      "Student notification exception:",
      error
    );
  }
}

async function createBookingNotifications({
  booking,
  property,
  studentName,
  remainingSpaces,
}: {
  booking: any;
  property: any;
  studentName: string;
  remainingSpaces: number;
}) {
  const studentPaid = Number(
    booking.total_amount || 0
  );

  const paystackCharges = Number(
    booking.payment_processing_fee || 0
  );

  const propertyAmount = Number(
    booking.amount || 0
  );

  const stuvanaCommission = Number(
    booking.commission_amount || 0
  );

  const ownerReceives = Number(
    booking.owner_amount ??
      propertyAmount - stuvanaCommission
  );

  await createOwnerNotification({
    ownerId: booking.owner_id,
    propertyId: booking.property_id,
    bookingId: booking.id,
    type: "booking_paid",
    title: "New student booking 🎉",
    message:
      `${studentName} has successfully paid for ${property.name}. ` +
      `Student paid: GH₵ ${studentPaid.toLocaleString()}. ` +
      `Property amount: GH₵ ${propertyAmount.toLocaleString()}. ` +
      `Paystack charges: GH₵ ${paystackCharges.toLocaleString()} (exempted from your earnings). ` +
      `STUVANA commission deducted: GH₵ ${stuvanaCommission.toLocaleString()}. ` +
      `Your earnings: GH₵ ${ownerReceives.toLocaleString()}. ` +
      `Remaining spaces: ${remainingSpaces}.`,
  });

  await createStudentNotification({
    studentId: booking.student_id,
    propertyId: booking.property_id,
    bookingId: booking.id,
    type: "booking_confirmed",
    title: "Booking Confirmed 🎉",
    message:
      `Your booking at ${property.name} has been confirmed successfully. ` +
      `Amount paid: GH₵ ${studentPaid.toLocaleString()}. ` +
      `Your accommodation allocation is now confirmed.`,
  });

  if (remainingSpaces <= 0) {
    await createOwnerNotification({
      ownerId: booking.owner_id,
      propertyId: booking.property_id,
      bookingId: booking.id,
      type: "property_full",
      title: "Property fully booked",
      message:
        `${property.name} is now fully booked. ` +
        `All available spaces have been allocated.`,
    });
  }
}

async function sendOwnerBookingEmail({
  booking,
  property,
  studentProfile,
  remainingSpaces,
}: {
  booking: any;
  property: any;
  studentProfile: any;
  remainingSpaces: number;
}) {
  try {
    const resendApiKey =
      process.env.RESEND_API_KEY;

    if (!resendApiKey) {
      console.warn(
        "RESEND_API_KEY is not configured. Owner email notification skipped."
      );
      return;
    }

    const resend = new Resend(resendApiKey);

    const {
      data: ownerUserData,
      error: ownerUserError,
    } =
      await supabaseAdmin.auth.admin.getUserById(
        booking.owner_id
      );

    if (
      ownerUserError ||
      !ownerUserData?.user?.email
    ) {
      console.error(
        "Owner email lookup error:",
        ownerUserError
      );
      return;
    }

    const ownerEmail =
      ownerUserData.user.email;

    const emailStudentName =
      studentProfile?.full_name ||
      "A student";

    const studentPhone =
      studentProfile?.phone ||
      "Not provided";

    const university =
      studentProfile?.university ||
      "Not provided";

    const fromEmail =
      process.env.RESEND_FROM_EMAIL ||
      "onboarding@resend.dev";

    const studentPaid = Number(
      booking.total_amount || 0
    );

    const paystackCharges = Number(
      booking.payment_processing_fee || 0
    );

    const propertyAmount = Number(
      booking.amount || 0
    );

    const stuvanaCommission = Number(
      booking.commission_amount || 0
    );

    const ownerReceives = Number(
      booking.owner_amount ??
        propertyAmount -
          stuvanaCommission
    );

    const { error: resendError } =
      await resend.emails.send({
        from: `STUVANA <${fromEmail}>`,
        to: [ownerEmail],
        subject:
          `New STUVANA Booking - ${property.name}`,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
            <h2>🎉 New STUVANA Booking</h2>

            <p>
              A student has successfully paid for your property.
            </p>

            <div style="padding:18px;background:#f9fafb;border-radius:12px;margin:20px 0">

              <p>
                <strong>Property:</strong>
                ${property.name}
              </p>

              <p>
                <strong>Student:</strong>
                ${emailStudentName}
              </p>

              <p>
                <strong>Phone:</strong>
                ${studentPhone}
              </p>

              <p>
                <strong>University:</strong>
                ${university}
              </p>

              <hr style="border:0;border-top:1px solid #e5e7eb;margin:16px 0" />

              <p>
                <strong>Amount paid by student:</strong>
                GH₵ ${studentPaid.toLocaleString()}
              </p>

              <p>
                <strong>Property amount:</strong>
                GH₵ ${propertyAmount.toLocaleString()}
              </p>

              <p>
                <strong>Paystack charges:</strong>
                GH₵ ${paystackCharges.toLocaleString()}
              </p>

              <p style="color:#166534">
                <strong>
                  Paystack charges are exempted from your earnings.
                </strong>
              </p>

              <p style="color:#b45309">
                <strong>
                  STUVANA commission deducted:
                </strong>
                GH₵ ${stuvanaCommission.toLocaleString()}
              </p>

              <p style="padding:12px;background:#ecfdf5;border-radius:10px;color:#166534;font-size:18px">
                <strong>Your earnings:</strong>
                GH₵ ${ownerReceives.toLocaleString()}
              </p>

              <p>
                <strong>Remaining spaces:</strong>
                ${remainingSpaces}
              </p>

              <p>
                <strong>Booking reference:</strong>
                ${booking.paystack_reference}
              </p>
            </div>

            ${
              remainingSpaces <= 0
                ? `
                  <p style="padding:12px 16px;background:#fef2f2;border-radius:10px;color:#991b1b;font-weight:700">
                    🚫 All spaces for this property have now been booked.
                  </p>
                `
                : `
                  <p style="padding:12px 16px;background:#f0fdf4;border-radius:10px;color:#166534;font-weight:700">
                    ✅ ${remainingSpaces} space${
                      remainingSpaces === 1
                        ? ""
                        : "s"
                    } remaining.
                  </p>
                `
            }

            <p style="margin-top:24px;color:#6b7280;font-size:13px">
              This notification was sent automatically by STUVANA.
            </p>
          </div>
        `,
      });

    if (resendError) {
      console.error(
        "Owner booking email error:",
        resendError
      );
    }
  } catch (error) {
    console.error(
      "Owner booking email notification failed:",
      error
    );
  }
}

async function sendAdminBookingEmail({
  booking,
  property,
  studentProfile,
  remainingSpaces,
}: {
  booking: any;
  property: any;
  studentProfile: any;
  remainingSpaces: number;
}) {
  try {
    const resendApiKey =
      process.env.RESEND_API_KEY;

    const adminEmail =
      process.env.ADMIN_EMAIL;

    if (!resendApiKey || !adminEmail) {
      console.warn(
        "RESEND_API_KEY or ADMIN_EMAIL is not configured. Admin booking email skipped."
      );
      return;
    }

    const resend = new Resend(resendApiKey);

    const fromEmail =
      process.env.RESEND_FROM_EMAIL ||
      "onboarding@resend.dev";

    const studentName =
      studentProfile?.full_name ||
      "A student";

    const studentPhone =
      studentProfile?.phone ||
      "Not provided";

    const studentUniversity =
      studentProfile?.university ||
      "Not provided";

    const studentPaid = Number(
      booking.total_amount || 0
    );

    const paystackCharges = Number(
      booking.payment_processing_fee || 0
    );

    const propertyAmount = Number(
      booking.amount || 0
    );

    const stuvanaCommission = Number(
      booking.commission_amount || 0
    );

    const ownerReceives = Number(
      booking.owner_amount ??
        propertyAmount -
          stuvanaCommission
    );

    const { data: ownerProfile } =
      await supabaseAdmin
        .from("profiles")
        .select(
          "full_name, phone, university"
        )
        .eq(
          "id",
          booking.owner_id
        )
        .maybeSingle();

    const ownerName =
      ownerProfile?.full_name ||
      "Property owner";

    const ownerPhone =
      ownerProfile?.phone ||
      "Not provided";

    const { error: resendError } =
      await resend.emails.send({
        from: `STUVANA Admin <${fromEmail}>`,
        to: [adminEmail],
        subject:
          `New Booking & Commission - ${property.name}`,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:750px;margin:0 auto">

            <h2>💰 New STUVANA Booking</h2>

            <p>
              A student has successfully booked and paid for a property.
            </p>

            <div style="padding:20px;background:#f9fafb;border-radius:12px;margin:20px 0">

              <h3>Booking Details</h3>

              <p>
                <strong>Property:</strong>
                ${property.name}
              </p>

              <p>
                <strong>Property ID:</strong>
                ${property.id}
              </p>

              <p>
                <strong>Booking ID:</strong>
                ${booking.id}
              </p>

              <p>
                <strong>Booking Reference:</strong>
                ${booking.paystack_reference}
              </p>

              <p>
                <strong>Remaining Spaces:</strong>
                ${remainingSpaces}
              </p>

            </div>

            <div style="padding:20px;background:#eff6ff;border-radius:12px;margin:20px 0">

              <h3>Student Details</h3>

              <p>
                <strong>Name:</strong>
                ${studentName}
              </p>

              <p>
                <strong>Phone:</strong>
                ${studentPhone}
              </p>

              <p>
                <strong>University:</strong>
                ${studentUniversity}
              </p>

            </div>

            <div style="padding:20px;background:#f5f3ff;border-radius:12px;margin:20px 0">

              <h3>Owner Details</h3>

              <p>
                <strong>Name:</strong>
                ${ownerName}
              </p>

              <p>
                <strong>Phone:</strong>
                ${ownerPhone}
              </p>

              <p>
                <strong>University:</strong>
                ${ownerProfile?.university || "Not provided"}
              </p>

            </div>

            <div style="padding:20px;background:#ecfdf5;border-radius:12px;margin:20px 0">

              <h3>💰 Financial Breakdown</h3>

              <p>
                <strong>Amount paid by student:</strong>
                GH₵ ${studentPaid.toLocaleString()}
              </p>

              <p>
                <strong>Paystack processing charge:</strong>
                GH₵ ${paystackCharges.toLocaleString()}
              </p>

              <p>
                <strong>Property amount:</strong>
                GH₵ ${propertyAmount.toLocaleString()}
              </p>

              <p style="color:#b45309">
                <strong>
                  STUVANA commission:
                </strong>
                GH₵ ${stuvanaCommission.toLocaleString()}
              </p>

              <p style="padding:14px;background:#dcfce7;border-radius:10px;color:#166534;font-size:19px">
                <strong>
                  STUVANA commission earned:
                </strong>
                GH₵ ${stuvanaCommission.toLocaleString()}
              </p>

              <p>
                <strong>
                  Owner amount after STUVANA commission:
                </strong>
                GH₵ ${ownerReceives.toLocaleString()}
              </p>

              <p style="font-size:13px;color:#6b7280">
                Paystack processing charges are included in the
                student's total payment and are not deducted
                from the owner's property amount.
              </p>

            </div>

            ${
              remainingSpaces <= 0
                ? `
                  <div style="padding:15px;background:#fef2f2;border-radius:10px;color:#991b1b;font-weight:700">
                    🚫 This property is now fully booked.
                  </div>
                `
                : `
                  <div style="padding:15px;background:#f0fdf4;border-radius:10px;color:#166534;font-weight:700">
                    ✅ ${remainingSpaces} space${
                      remainingSpaces === 1
                        ? ""
                        : "s"
                    } remaining.
                  </div>
                `
            }

            <p style="margin-top:24px;color:#6b7280;font-size:13px">
              This notification was sent automatically by STUVANA.
            </p>

          </div>
        `,
      });

    if (resendError) {
      console.error(
        "Admin booking email error:",
        resendError
      );
    }
  } catch (error) {
    console.error(
      "Admin booking email notification failed:",
      error
    );
  }
}

export async function POST(request: Request) {
  try {
    const { reference } =
      await request.json();

    if (
      !reference ||
      typeof reference !== "string"
    ) {
      return NextResponse.json(
        {
          error:
            "Payment reference is required.",
        },
        { status: 400 }
      );
    }

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

    const {
      data: booking,
      error: bookingError,
    } =
      await supabaseAdmin
        .from("bookings")
        .select("*")
        .eq(
          "paystack_reference",
          reference
        )
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

    if (
      booking.status === "paid" &&
      booking.space_reduced === true
    ) {
      const {
        data: paidProperty,
      } =
        await supabaseAdmin
          .from("properties")
          .select(
            "id, name, spaces, status, owner_id"
          )
          .eq(
            "id",
            booking.property_id
          )
          .maybeSingle();

      return NextResponse.json({
        success: true,
        alreadyPaid: true,
        alreadyProcessed: true,
        bookingId: booking.id,
        amount: booking.amount,
        paymentProcessingFee:
          booking.payment_processing_fee,
        totalAmount: booking.total_amount,
        commission:
          booking.commission_amount,
        ownerAmount:
          booking.owner_amount,
        remainingSpaces:
          paidProperty?.spaces ?? null,
        roomUnavailable:
          Number(
            paidProperty?.spaces ?? 0
          ) <= 0,
      });
    }

    if (
      booking.status === "paid" &&
      booking.space_reduced !== true
    ) {
      const {
        data: property,
        error: propertyError,
      } =
        await supabaseAdmin
          .from("properties")
          .select(
            "id, name, status, spaces, owner_id"
          )
          .eq(
            "id",
            booking.property_id
          )
          .maybeSingle();

      if (
        propertyError ||
        !property
      ) {
        console.error(
          "Paid booking property lookup error:",
          propertyError
        );

        return NextResponse.json(
          {
            error:
              "The accommodation could not be found.",
          },
          { status: 404 }
        );
      }

      if (
        property.status !==
        "approved"
      ) {
        return NextResponse.json(
          {
            error:
              "This accommodation is no longer available.",
          },
          { status: 409 }
        );
      }

      let remainingSpaces: number;

      try {
        const {
          data,
          error,
        } =
          await supabaseAdmin.rpc(
            "reduce_property_space",
            {
              p_property_id:
                booking.property_id,
            }
          );

        if (error) {
          console.error(
            "Reduce property space RPC error:",
            error
          );

          return NextResponse.json(
            {
              error:
                error.message ||
                "Could not update the available spaces.",
            },
            { status: 500 }
          );
        }

        remainingSpaces =
          Number(data);
      } catch (error) {
        console.error(
          "Reduce property space exception:",
          error
        );

        return NextResponse.json(
          {
            error:
              "Could not update the available spaces.",
          },
          { status: 500 }
        );
      }

      const {
        data: markedBooking,
        error: markError,
      } =
        await supabaseAdmin
          .from("bookings")
          .update({
            space_reduced: true,
          })
          .eq("id", booking.id)
          .eq("space_reduced", false)
          .select("*")
          .maybeSingle();

      if (markError) {
        console.error(
          "Space reduction tracking error:",
          markError
        );

        await supabaseAdmin
          .from("properties")
          .update({
            spaces:
              remainingSpaces + 1,
          })
          .eq(
            "id",
            booking.property_id
          )
          .eq(
            "spaces",
            remainingSpaces
          );

        return NextResponse.json(
          {
            error:
              "The booking could not be fully processed.",
          },
          { status: 500 }
        );
      }

      if (!markedBooking) {
        await supabaseAdmin
          .from("properties")
          .update({
            spaces:
              remainingSpaces + 1,
          })
          .eq(
            "id",
            booking.property_id
          )
          .eq(
            "spaces",
            remainingSpaces
          );

        const {
          data: latestBooking,
        } =
          await supabaseAdmin
            .from("bookings")
            .select("*")
            .eq(
              "id",
              booking.id
            )
            .maybeSingle();

        return NextResponse.json({
          success:
            latestBooking?.status ===
            "paid",
          alreadyPaid: true,
          bookingId:
            booking.id,
          remainingSpaces:
            remainingSpaces + 1,
        });
      }

      const {
        data: studentProfile,
      } =
        await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq(
            "id",
            booking.student_id
          )
          .maybeSingle();

      const studentName =
        studentProfile?.full_name ||
        "A student";

      await createBookingNotifications({
        booking: markedBooking,
        property,
        studentName,
        remainingSpaces,
      });

      return NextResponse.json({
        success: true,
        alreadyPaid: true,
        spaceReduced: true,
        bookingId:
          markedBooking.id,
        amount:
          markedBooking.amount,
        paymentProcessingFee:
          markedBooking.payment_processing_fee,
        totalAmount:
          markedBooking.total_amount,
        commission:
          markedBooking.commission_amount,
        ownerAmount:
          markedBooking.owner_amount,
        remainingSpaces,
        roomUnavailable:
          remainingSpaces <= 0,
      });
    }

    const response =
      await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(
          reference
        )}`,
        {
          method: "GET",
          headers: {
            Authorization:
              `Bearer ${secretKey}`,
            "Content-Type":
              "application/json",
          },
          cache: "no-store",
        }
      );

    const paystackData =
      await response.json();

    if (
      !response.ok ||
      !paystackData.status
    ) {
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

    const transaction =
      paystackData.data;

    if (
      transaction.status !==
      "success"
    ) {
      return NextResponse.json({
        success: false,
        status:
          transaction.status,
      });
    }

    const expectedAmount =
      Math.round(
        Number(
          booking.total_amount
        ) * 100
      );

    if (
      Number(
        transaction.amount
      ) !== expectedAmount
    ) {
      console.error(
        "Payment amount mismatch:",
        {
          expected:
            expectedAmount,
          received:
            Number(
              transaction.amount
            ),
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

    if (
      transaction.currency !==
      booking.currency
    ) {
      console.error(
        "Payment currency mismatch:",
        {
          expected:
            booking.currency,
          received:
            transaction.currency,
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

    if (
      transaction.reference !==
      booking.paystack_reference
    ) {
      console.error(
        "Payment reference mismatch:",
        {
          expected:
            booking.paystack_reference,
          received:
            transaction.reference,
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

    const {
      data: property,
      error: propertyError,
    } =
      await supabaseAdmin
        .from("properties")
        .select(
          "id, name, status, spaces, owner_id"
        )
        .eq(
          "id",
          booking.property_id
        )
        .maybeSingle();

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
            "The accommodation could not be found.",
        },
        { status: 404 }
      );
    }

    if (
      property.status !==
      "approved"
    ) {
      return NextResponse.json(
        {
          error:
            "This accommodation is no longer available for booking.",
        },
        { status: 409 }
      );
    }

    let remainingSpaces: number;

    try {
      const {
        data,
        error,
      } =
        await supabaseAdmin.rpc(
          "reduce_property_space",
          {
            p_property_id:
              booking.property_id,
          }
        );

      if (error) {
        console.error(
          "Reduce property space RPC error:",
          error
        );

        return NextResponse.json(
          {
            error:
              error.message ||
              "Could not update available spaces.",
          },
          { status: 500 }
        );
      }

      remainingSpaces =
        Number(data);
    } catch (error) {
      console.error(
        "Reduce property space exception:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Could not update available spaces.",
        },
        { status: 500 }
      );
    }

    const {
      data: updatedBooking,
      error: updateError,
    } =
      await supabaseAdmin
        .from("bookings")
        .update({
          status: "paid",
          paid_at:
            transaction.paid_at ||
            new Date().toISOString(),
          space_reduced: true,
        })
        .eq("id", booking.id)
        .eq("status", "pending")
        .eq("space_reduced", false)
        .select("*")
        .maybeSingle();

    if (updateError) {
      console.error(
        "Booking update error:",
        updateError
      );

      await supabaseAdmin
        .from("properties")
        .update({
          spaces:
            remainingSpaces + 1,
        })
        .eq(
          "id",
          booking.property_id
        )
        .eq(
          "spaces",
          remainingSpaces
        );

      return NextResponse.json(
        {
          error:
            "Payment was verified, but the booking could not be confirmed.",
        },
        { status: 500 }
      );
    }

    if (!updatedBooking) {
      const {
        data: latestBooking,
      } =
        await supabaseAdmin
          .from("bookings")
          .select("*")
          .eq(
            "id",
            booking.id
          )
          .maybeSingle();

      if (
        latestBooking?.status ===
        "paid"
      ) {
        await supabaseAdmin
          .from("properties")
          .update({
            spaces:
              remainingSpaces + 1,
          })
          .eq(
            "id",
            booking.property_id
          )
          .eq(
            "spaces",
            remainingSpaces
          );

        const {
          data: correctedProperty,
        } =
          await supabaseAdmin
            .from("properties")
            .select("spaces")
            .eq(
              "id",
              booking.property_id
            )
            .maybeSingle();

        return NextResponse.json({
          success: true,
          alreadyPaid: true,
          bookingId:
            latestBooking.id,
          remainingSpaces:
            correctedProperty?.spaces ??
            null,
        });
      }

      await supabaseAdmin
        .from("properties")
        .update({
          spaces:
            remainingSpaces + 1,
        })
        .eq(
          "id",
          booking.property_id
        )
        .eq(
          "spaces",
          remainingSpaces
        );

      return NextResponse.json(
        {
          error:
            "Could not confirm payment status.",
        },
        { status: 500 }
      );
    }

    const {
      data: studentProfile,
    } =
      await supabaseAdmin
        .from("profiles")
        .select(
          "full_name, phone, university"
        )
        .eq(
          "id",
          booking.student_id
        )
        .maybeSingle();

    const studentName =
      studentProfile?.full_name ||
      "A student";

    await createBookingNotifications({
      booking: updatedBooking,
      property,
      studentName,
      remainingSpaces,
    });

    /*
     * =====================================================
     * OWNER EMAIL + ADMIN EMAIL
     * =====================================================
     */

    await sendOwnerBookingEmail({
      booking: updatedBooking,
      property,
      studentProfile,
      remainingSpaces,
    });

    await sendAdminBookingEmail({
      booking: updatedBooking,
      property,
      studentProfile,
      remainingSpaces,
    });

    return NextResponse.json({
      success: true,
      bookingId:
        updatedBooking.id,
      amount:
        updatedBooking.amount,
      paymentProcessingFee:
        updatedBooking.payment_processing_fee,
      totalAmount:
        updatedBooking.total_amount,
      commission:
        updatedBooking.commission_amount,
      ownerAmount:
        updatedBooking.owner_amount,
      remainingSpaces,
      roomUnavailable:
        remainingSpaces <= 0,
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