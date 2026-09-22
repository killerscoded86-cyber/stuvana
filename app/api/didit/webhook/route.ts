import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function verifySignatureV2(
  rawBody: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  const now = Math.floor(Date.now() / 1000);
  const incomingTimestamp = Number.parseInt(timestamp, 10);

  if (!Number.isFinite(incomingTimestamp)) {
    return false;
  }

  // Reject webhooks older than 5 minutes.
  if (Math.abs(now - incomingTimestamp) > 300) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const expected = Buffer.from(expectedSignature, "utf8");
  const received = Buffer.from(signature, "utf8");

  return (
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received)
  );
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.DIDIT_WEBHOOK_SECRET;

    if (!secret) {
      console.error("DIDIT_WEBHOOK_SECRET is missing.");

      return NextResponse.json(
        {
          success: false,
          message: "Webhook secret is not configured.",
        },
        { status: 500 }
      );
    }

    const signature = request.headers.get("x-signature-v2");
    const timestamp = request.headers.get("x-timestamp");

    if (!signature || !timestamp) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing Didit signature headers.",
        },
        { status: 401 }
      );
    }

    // Read the raw body before parsing.
    const rawBody = await request.text();

    // Verify Didit's signature against the raw body.
    const verified = verifySignatureV2(
      rawBody,
      signature,
      timestamp,
      secret
    );

    if (!verified) {
      console.error("Invalid Didit webhook signature.");

      return NextResponse.json(
        {
          success: false,
          message: "Invalid signature.",
        },
        { status: 401 }
      );
    }

    let body: any;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid JSON payload.",
        },
        { status: 400 }
      );
    }

    /*
     * Do NOT log the complete Didit body.
     * It can contain sensitive identity information.
     */

    const webhook = body as {
      webhook_type?: string;
      event_id?: string;
      session_id?: string;
      status?: string;
      vendor_data?: string;
      environment?: string;
      decision?: {
        id_verifications?: Array<{
          status?: string;
          document_type?: string;
        }>;
      };
    };

    console.log("Didit webhook received:", {
      event: webhook.webhook_type,
      eventId: webhook.event_id,
      sessionId: webhook.session_id,
      status: webhook.status,
      vendorData: webhook.vendor_data,
      environment: webhook.environment,
    });

    /*
     * Only status.updated changes the STUVANA
     * verification status.
     */
    if (webhook.webhook_type !== "status.updated") {
      return NextResponse.json(
        {
          success: true,
          message: "Webhook received. No status update required.",
        },
        { status: 200 }
      );
    }

    const userId = webhook.vendor_data;
    const sessionId = webhook.session_id;

    if (!userId) {
      console.error("Didit webhook is missing vendor_data.");

      return NextResponse.json(
        {
          success: false,
          message: "Missing vendor_data.",
        },
        { status: 400 }
      );
    }

    if (!sessionId) {
      console.error("Didit webhook is missing session_id.");

      return NextResponse.json(
        {
          success: false,
          message: "Missing session_id.",
        },
        { status: 400 }
      );
    }

    const diditStatus = String(webhook.status || "")
      .trim()
      .toLowerCase();

    const documentType =
      webhook.decision?.id_verifications?.[0]?.document_type ||
      "Didit";

    /*
     * =====================================================
     * APPROVED
     * =====================================================
     */

    if (diditStatus === "approved") {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .update({
          verification_status: "verified",
          verification_reference: sessionId,
          verification_id_type: documentType,
          verification_verified_at: new Date().toISOString(),
          verification_rejection_reason: null,
        })
        .eq("id", userId)
        .select("id, verification_status")
        .maybeSingle();

      if (error) {
        console.error("Supabase verified update failed:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });

        return NextResponse.json(
          {
            success: false,
            message: "Failed to update profile.",
          },
          { status: 500 }
        );
      }

      if (!data) {
        console.error(
          "No profile found for Didit vendor_data:",
          userId
        );

        return NextResponse.json(
          {
            success: false,
            message: "STUVANA profile not found.",
          },
          { status: 404 }
        );
      }

      console.log(
        `STUVANA verification approved for user ${userId}.`
      );

      return NextResponse.json(
        {
          success: true,
          message: "Verification approved and profile updated.",
        },
        { status: 200 }
      );
    }

    /*
     * =====================================================
     * PENDING / IN REVIEW
     * =====================================================
     */

    if (
      diditStatus === "pending" ||
      diditStatus === "in review" ||
      diditStatus === "in_review"
    ) {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .update({
          verification_status: "pending",
          verification_reference: sessionId,
          verification_submitted_at: new Date().toISOString(),
          verification_rejection_reason: null,
        })
        .eq("id", userId)
        .select("id, verification_status")
        .maybeSingle();

      if (error) {
        console.error("Supabase pending update failed:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });

        return NextResponse.json(
          {
            success: false,
            message: "Failed to update profile.",
          },
          { status: 500 }
        );
      }

      if (!data) {
        console.error(
          "No profile found for Didit vendor_data:",
          userId
        );

        return NextResponse.json(
          {
            success: false,
            message: "STUVANA profile not found.",
          },
          { status: 404 }
        );
      }

      console.log(
        `STUVANA verification pending for user ${userId}.`
      );

      return NextResponse.json(
        {
          success: true,
          message: "Verification pending.",
        },
        { status: 200 }
      );
    }

    /*
     * =====================================================
     * DECLINED / REJECTED
     * =====================================================
     */

    if (
      diditStatus === "declined" ||
      diditStatus === "rejected"
    ) {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .update({
          verification_status: "rejected",
          verification_reference: sessionId,
          verification_rejection_reason:
            "Didit verification was declined.",
        })
        .eq("id", userId)
        .select("id, verification_status")
        .maybeSingle();

      if (error) {
        console.error("Supabase rejected update failed:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });

        return NextResponse.json(
          {
            success: false,
            message: "Failed to update profile.",
          },
          { status: 500 }
        );
      }

      if (!data) {
        console.error(
          "No profile found for Didit vendor_data:",
          userId
        );

        return NextResponse.json(
          {
            success: false,
            message: "STUVANA profile not found.",
          },
          { status: 404 }
        );
      }

      console.log(
        `STUVANA verification rejected for user ${userId}.`
      );

      return NextResponse.json(
        {
          success: true,
          message: "Verification declined.",
        },
        { status: 200 }
      );
    }

    /*
     * =====================================================
     * OTHER DIDIT STATUS
     * =====================================================
     */

    console.log(
      `Unhandled Didit status: ${webhook.status}`
    );

    return NextResponse.json(
      {
        success: true,
        message: "Webhook received. Status not handled.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Didit webhook error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal webhook error.",
      },
      { status: 500 }
    );
  }
}