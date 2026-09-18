import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function shortenFloats(data: JsonValue): JsonValue {
  if (Array.isArray(data)) {
    return data.map(shortenFloats);
  }

  if (data !== null && typeof data === "object") {
    const result: { [key: string]: JsonValue } = {};

    for (const [key, value] of Object.entries(data)) {
      result[key] = shortenFloats(value);
    }

    return result;
  }

  if (
    typeof data === "number" &&
    !Number.isInteger(data) &&
    data % 1 === 0
  ) {
    return Math.trunc(data);
  }

  return data;
}

function sortKeys(data: JsonValue): JsonValue {
  if (Array.isArray(data)) {
    return data.map(sortKeys);
  }

  if (data !== null && typeof data === "object") {
    const result: { [key: string]: JsonValue } = {};

    for (const key of Object.keys(data).sort()) {
      result[key] = sortKeys(data[key]);
    }

    return result;
  }

  return data;
}

function verifySignatureV2(
  body: JsonValue,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  const now = Math.floor(Date.now() / 1000);
  const incomingTimestamp = Number.parseInt(timestamp, 10);

  if (!Number.isFinite(incomingTimestamp)) {
    return false;
  }

  if (Math.abs(now - incomingTimestamp) > 300) {
    return false;
  }

  const canonicalBody = JSON.stringify(
    sortKeys(shortenFloats(body))
  );

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(canonicalBody, "utf8")
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

    /*
     * Read the body and verify the Didit signature.
     */
    const rawBody = await request.text();

    const body = JSON.parse(rawBody) as JsonValue;

    const verified = verifySignatureV2(
      body,
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

    console.log("Verified Didit webhook:", body);

    const webhook = body as {
      webhook_type?: string;
      event_id?: string;
      session_id?: string;
      status?: string;
      vendor_data?: string;
      environment?: string;
      timestamp?: string;
      decision?: {
        id_verification?: {
          document_type?: string;
        };
      };
    };

    console.log("Event:", webhook.webhook_type);
    console.log("Event ID:", webhook.event_id);
    console.log("Session:", webhook.session_id);
    console.log("Status:", webhook.status);
    console.log("Vendor data:", webhook.vendor_data);
    console.log("Environment:", webhook.environment);

    /*
     * We only use session status updates to change
     * the STUVANA verification status.
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

    if (!userId) {
      console.error(
        "Didit webhook does not contain vendor_data."
      );

      return NextResponse.json(
        {
          success: false,
          message: "Missing vendor_data.",
        },
        { status: 400 }
      );
    }

    if (!webhook.session_id) {
      console.error(
        "Didit webhook does not contain session_id."
      );

      return NextResponse.json(
        {
          success: false,
          message: "Missing session_id.",
        },
        { status: 400 }
      );
    }

    const diditStatus = String(
      webhook.status || ""
    ).trim();

    /*
     * Approved = identity successfully verified.
     */
    if (diditStatus === "Approved") {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          verification_status: "verified",
          verification_reference: webhook.session_id,
          verification_id_type:
            webhook.decision?.id_verification
              ?.document_type || "Didit",
          verification_verified_at:
            new Date().toISOString(),
          verification_rejection_reason: null,
        })
        .eq("id", userId);

      if (error) {
        console.error(
          "Failed to update verified profile:",
          error
        );

        return NextResponse.json(
          {
            success: false,
            message: "Failed to update profile.",
          },
          { status: 500 }
        );
      }

      console.log(
        `STUVANA user ${userId} is now VERIFIED.`
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
     * Pending / In Review means the verification
     * has been submitted but Didit has not approved it yet.
     */
    if (
      diditStatus === "Pending" ||
      diditStatus === "In Review"
    ) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          verification_status: "pending",
          verification_reference: webhook.session_id,
          verification_submitted_at:
            new Date().toISOString(),
          verification_rejection_reason: null,
        })
        .eq("id", userId);

      if (error) {
        console.error(
          "Failed to update pending profile:",
          error
        );

        return NextResponse.json(
          {
            success: false,
            message: "Failed to update profile.",
          },
          { status: 500 }
        );
      }

      console.log(
        `STUVANA user ${userId} verification is PENDING.`
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
     * Declined means Didit did not approve the identity.
     */
    if (diditStatus === "Declined") {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          verification_status: "rejected",
          verification_reference: webhook.session_id,
          verification_rejection_reason:
            "Didit verification was declined.",
        })
        .eq("id", userId);

      if (error) {
        console.error(
          "Failed to update rejected profile:",
          error
        );

        return NextResponse.json(
          {
            success: false,
            message: "Failed to update profile.",
          },
          { status: 500 }
        );
      }

      console.log(
        `STUVANA user ${userId} verification was REJECTED.`
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
     * Unknown Didit status.
     * Do not mark the user as verified.
     */
    console.log(
      `Unhandled Didit status: ${diditStatus}`
    );

    return NextResponse.json(
      {
        success: true,
        message: "Webhook received. Status not handled.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "Didit webhook error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message: "Invalid webhook request.",
      },
      { status: 400 }
    );
  }
}