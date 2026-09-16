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
    /*
     * Prevent duplicate notifications for the same
     * owner + booking + notification type.
     */
    let query = supabaseAdmin
      .from("owner_notifications")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("property_id", propertyId)
      .eq("type", type)
      .limit(1);

    if (bookingId) {
      query = query.eq(
        "booking_id",
        bookingId
      );
    } else {
      query = query.is(
        "booking_id",
        null
      );
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

    const {
      error: notificationError,
    } = await supabaseAdmin
      .from("owner_notifications")
      .insert({
        owner_id: ownerId,
        property_id: propertyId,
        booking_id:
          bookingId || null,
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
    /*
     * Notification failure must never cancel
     * a successful payment.
     */
    console.error(
      "Owner notification exception:",
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
  /*
   * Always create a new booking notification.
   */
  await createOwnerNotification({
    ownerId: booking.owner_id,
    propertyId: booking.property_id,
    bookingId: booking.id,
    type: "booking_paid",
    title: "New student booking",
    message:
      `${studentName} has successfully paid for ${property.name}. ` +
      `Amount paid: GH₵ ${Number(
        booking.total_amount
      ).toLocaleString()}. ` +
      `Remaining spaces: ${remainingSpaces}.`,
  });

  /*
   * Create a second notification only when the
   * property has become fully booked.
   */
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

    /*
     * Find the STUVANA booking.
     */
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

    /*
     * =====================================================
     * ALREADY PAID + ALREADY PROCESSED
     * =====================================================
     */
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
        bookingId:
          booking.id,
        amount:
          booking.amount,
        paymentProcessingFee:
          booking.payment_processing_fee,
        totalAmount:
          booking.total_amount,
        commission:
          booking.commission_amount,
        ownerAmount:
          booking.owner_amount,
        remainingSpaces:
          paidProperty?.spaces ??
          null,
        roomUnavailable:
          Number(
            paidProperty?.spaces ??
              0
          ) <= 0,
      });
    }

    /*
     * =====================================================
     * OLD PAID BOOKING
     * =====================================================
     *
     * This handles a booking that was already marked
     * paid before the space-reduction/notification
     * system was installed.
     */
    if (
      booking.status === "paid" &&
      booking.space_reduced !== true
    ) {
      const {
        data: property,
        error:
          propertyError,
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
            space_reduced:
              true,
          })
          .eq(
            "id",
            booking.id
          )
          .eq(
            "space_reduced",
            false
          )
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
              remainingSpaces +
              1,
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
              remainingSpaces +
              1,
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
          alreadyPaid:
            true,
          bookingId:
            booking.id,
          remainingSpaces:
            remainingSpaces +
            1,
        });
      }

      /*
       * Get student information for the dashboard
       * notification.
       */
      const {
        data: studentProfile,
      } =
        await supabaseAdmin
          .from("profiles")
          .select(
            "full_name"
          )
          .eq(
            "id",
            booking.student_id
          )
          .maybeSingle();

      const studentName =
        studentProfile
          ?.full_name ||
        "A student";

      await createBookingNotifications({
        booking:
          markedBooking,
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

    /*
     * =====================================================
     * VERIFY NEW PAYMENT WITH PAYSTACK
     * =====================================================
     */
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
          cache:
            "no-store",
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

    /*
     * Payment must actually be successful.
     */
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

    /*
     * Confirm exact amount.
     */
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

    /*
     * Confirm currency.
     */
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

    /*
     * Confirm reference.
     */
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

    /*
     * Get the property.
     */
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

    /*
     * =====================================================
     * ATOMIC SPACE REDUCTION
     * =====================================================
     */
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

    /*
     * =====================================================
     * MARK BOOKING AS PAID
     * =====================================================
     */
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
          space_reduced:
            true,
        })
        .eq(
          "id",
          booking.id
        )
        .eq(
          "status",
          "pending"
        )
        .eq(
          "space_reduced",
          false
        )
        .select("*")
        .maybeSingle();

    if (updateError) {
      console.error(
        "Booking update error:",
        updateError
      );

      /*
       * Roll back the space if the booking
       * could not be confirmed.
       */
      await supabaseAdmin
        .from("properties")
        .update({
          spaces:
            remainingSpaces +
            1,
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

    /*
     * Handle duplicate verification attempts.
     */
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
              remainingSpaces +
              1,
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
            .select(
              "spaces"
            )
            .eq(
              "id",
              booking.property_id
            )
            .maybeSingle();

        return NextResponse.json({
          success:
            true,
          alreadyPaid:
            true,
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
            remainingSpaces +
            1,
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

    /*
     * =====================================================
     * CREATE OWNER DASHBOARD NOTIFICATIONS
     * =====================================================
     */
    const {
      data: studentProfile,
    } =
      await supabaseAdmin
        .from("profiles")
        .select(
          "full_name"
        )
        .eq(
          "id",
          booking.student_id
        )
        .maybeSingle();

    const studentName =
      studentProfile
        ?.full_name ||
      "A student";

    await createBookingNotifications({
      booking:
        updatedBooking,
      property,
      studentName,
      remainingSpaces,
    });

    /*
     * =====================================================
     * OWNER EMAIL NOTIFICATION
     * =====================================================
     */
    try {
      const resendApiKey =
        process.env.RESEND_API_KEY;

      if (!resendApiKey) {
        console.warn(
          "RESEND_API_KEY is not configured. Owner email notification skipped."
        );
      } else {
        const resend =
          new Resend(
            resendApiKey
          );

        const {
          data:
            ownerUserData,
          error:
            ownerUserError,
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
        } else {
          const {
            data:
              detailedStudentProfile,
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

          const ownerEmail =
            ownerUserData
              .user
              .email;

          const emailStudentName =
            detailedStudentProfile
              ?.full_name ||
            "A student";

          const studentPhone =
            detailedStudentProfile
              ?.phone ||
            "Not provided";

          const university =
            detailedStudentProfile
              ?.university ||
            "Not provided";

          const fromEmail =
            process.env
              .RESEND_FROM_EMAIL ||
            "onboarding@resend.dev";

          const {
            error:
              resendError,
          } =
            await resend.emails.send({
              from:
                `STUVANA <${fromEmail}>`,
              to: [
                ownerEmail,
              ],
              subject:
                `New STUVANA Booking - ${property.name}`,
              html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
                  <h2 style="margin-bottom: 8px;">
                    🎉 New STUVANA Booking
                  </h2>

                  <p>
                    A student has successfully paid for your property.
                  </p>

                  <div style="padding: 18px; background: #f9fafb; border-radius: 12px; margin: 20px 0;">
                    <p style="margin: 6px 0;">
                      <strong>Property:</strong>
                      ${property.name}
                    </p>

                    <p style="margin: 6px 0;">
                      <strong>Student:</strong>
                      ${emailStudentName}
                    </p>

                    <p style="margin: 6px 0;">
                      <strong>Phone:</strong>
                      ${studentPhone}
                    </p>

                    <p style="margin: 6px 0;">
                      <strong>University:</strong>
                      ${university}
                    </p>

                    <p style="margin: 6px 0;">
                      <strong>Amount paid:</strong>
                      GH₵ ${Number(
                        updatedBooking.total_amount
                      ).toLocaleString()}
                    </p>

                    <p style="margin: 6px 0;">
                      <strong>Remaining spaces:</strong>
                      ${remainingSpaces}
                    </p>

                    <p style="margin: 6px 0;">
                      <strong>Booking reference:</strong>
                      ${updatedBooking.paystack_reference}
                    </p>
                  </div>

                  ${
                    remainingSpaces <= 0
                      ? `
                        <p style="padding: 12px 16px; background: #fef2f2; border-radius: 10px; color: #991b1b; font-weight: 700;">
                          🚫 All spaces for this property have now been booked.
                        </p>
                      `
                      : `
                        <p style="padding: 12px 16px; background: #f0fdf4; border-radius: 10px; color: #166534; font-weight: 700;">
                          ✅ ${remainingSpaces} space${
                            remainingSpaces ===
                            1
                              ? ""
                              : "s"
                          } remaining.
                        </p>
                      `
                  }

                  <p style="margin-top: 24px; color: #6b7280; font-size: 13px;">
                    This notification was sent automatically by STUVANA.
                  </p>
                </div>
              `,
            });

          if (
            resendError
          ) {
            console.error(
              "Resend email error:",
              resendError
            );
          }
        }
      }
    } catch (
      notificationError
    ) {
      console.error(
        "Owner email notification failed:",
        notificationError
      );
    }

    return NextResponse.json({
      success:
        true,
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
        remainingSpaces <=
        0,
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