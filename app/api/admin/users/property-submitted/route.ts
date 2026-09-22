import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";

export async function POST(request: Request) {
  try {
    const { propertyId } = await request.json();

    if (!propertyId) {
      return NextResponse.json(
        {
          error: "Property ID is required.",
        },
        { status: 400 }
      );
    }

    const resendApiKey =
      process.env.RESEND_API_KEY;

    const adminEmail =
      process.env.ADMIN_EMAIL;

    if (!resendApiKey || !adminEmail) {
      console.error(
        "RESEND_API_KEY or ADMIN_EMAIL is not configured."
      );

      return NextResponse.json(
        {
          error:
            "Admin email notification is not configured.",
        },
        { status: 500 }
      );
    }

    const {
      data: property,
      error: propertyError,
    } =
      await supabaseAdmin
        .from("properties")
        .select(
          `
            id,
            name,
            location,
            room_type,
            price,
            display_price,
            period,
            spaces,
            university,
            description,
            walking_minutes,
            latitude,
            longitude,
            owner_id,
            created_at
          `
        )
        .eq("id", propertyId)
        .single();

    if (propertyError || !property) {
      console.error(
        "Property lookup error:",
        propertyError
      );

      return NextResponse.json(
        {
          error:
            "Property could not be found.",
        },
        { status: 404 }
      );
    }

    const {
      data: owner,
      error: ownerError,
    } =
      await supabaseAdmin
        .from("profiles")
        .select(
          "full_name, phone, university"
        )
        .eq("id", property.owner_id)
        .maybeSingle();

    if (ownerError) {
      console.error(
        "Owner profile lookup error:",
        ownerError
      );
    }

    const resend =
      new Resend(resendApiKey);

    const fromEmail =
      process.env.RESEND_FROM_EMAIL ||
      "onboarding@resend.dev";

    const { error: resendError } =
      await resend.emails.send({
        from:
          `STUVANA Admin <${fromEmail}>`,
        to: [adminEmail],
        subject:
          `New Property Submitted - ${property.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 700px; margin: 0 auto;">

            <h2 style="margin-bottom: 8px;">
              🏠 New Property Submitted
            </h2>

            <p>
              A verified STUVANA property owner has submitted
              a new property for admin review.
            </p>

            <div style="padding: 20px; background: #f9fafb; border-radius: 12px; margin: 20px 0;">

              <h3 style="margin-top: 0;">
                Property Details
              </h3>

              <p>
                <strong>Property:</strong>
                ${property.name}
              </p>

              <p>
                <strong>Location:</strong>
                ${property.location}
              </p>

              <p>
                <strong>University:</strong>
                ${property.university || "Not provided"}
              </p>

              <p>
                <strong>Room Type:</strong>
                ${property.room_type}
              </p>

              <p>
                <strong>Owner's Price:</strong>
                GH₵ ${Number(
                  property.price || 0
                ).toLocaleString("en-GH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>

              <p>
                <strong>Student Price:</strong>
                GH₵ ${Number(
                  property.display_price || 0
                ).toLocaleString("en-GH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>

              <p>
                <strong>Payment Period:</strong>
                ${property.period}
              </p>

              <p>
                <strong>Available Spaces:</strong>
                ${property.spaces}
              </p>

              <p>
                <strong>Walking Time:</strong>
                ${
                  property.walking_minutes
                    ? `${property.walking_minutes} minutes`
                    : "Not provided"
                }
              </p>

              <p>
                <strong>Precise Location:</strong>
                ${
                  property.latitude !== null &&
                  property.longitude !== null
                    ? `${property.latitude}, ${property.longitude}`
                    : "Not provided"
                }
              </p>

              ${
                property.description
                  ? `
                    <p>
                      <strong>Description:</strong><br />
                      ${property.description}
                    </p>
                  `
                  : ""
              }

            </div>

            <div style="padding: 20px; background: #eff6ff; border-radius: 12px; margin: 20px 0;">

              <h3 style="margin-top: 0;">
                Owner Details
              </h3>

              <p>
                <strong>Name:</strong>
                ${owner?.full_name || "Not provided"}
              </p>

              <p>
                <strong>Phone:</strong>
                ${owner?.phone || "Not provided"}
              </p>

              <p>
                <strong>University:</strong>
                ${owner?.university || "Not provided"}
              </p>

              <p>
                <strong>Owner ID:</strong>
                ${property.owner_id}
              </p>

            </div>

            <div style="padding: 16px; background: #fff7ed; border-radius: 10px; color: #9a3412;">
              <strong>⚠️ Admin Review Required</strong>

              <p style="margin-bottom: 0;">
                Please review this property from the STUVANA
                admin dashboard before approving it.
              </p>
            </div>

            <p style="margin-top: 24px; color: #6b7280; font-size: 13px;">
              This notification was sent automatically by STUVANA.
            </p>

          </div>
        `,
      });

    if (resendError) {
      console.error(
        "Admin property email error:",
        resendError
      );

      return NextResponse.json(
        {
          error:
            "Property was submitted, but the admin email could not be sent.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Admin property notification sent.",
    });
  } catch (error) {
    console.error(
      "Admin property notification error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Could not send admin property notification.",
      },
      { status: 500 }
    );
  }
}