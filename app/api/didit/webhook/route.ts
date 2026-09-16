import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

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
        { success: false, message: "Webhook secret is not configured." },
        { status: 500 }
      );
    }

    const signature = request.headers.get("x-signature-v2");
    const timestamp = request.headers.get("x-timestamp");

    if (!signature || !timestamp) {
      return NextResponse.json(
        { success: false, message: "Missing Didit signature headers." },
        { status: 401 }
      );
    }

    const body = (await request.json()) as JsonValue;

    const verified = verifySignatureV2(
      body,
      signature,
      timestamp,
      secret
    );

    if (!verified) {
      console.error("Invalid Didit webhook signature.");
      return NextResponse.json(
        { success: false, message: "Invalid signature." },
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
    };

    console.log("Event:", webhook.webhook_type);
    console.log("Session:", webhook.session_id);
    console.log("Status:", webhook.status);
    console.log("Vendor data:", webhook.vendor_data);
    console.log("Environment:", webhook.environment);

    return NextResponse.json(
      {
        success: true,
        message: "Didit webhook verified successfully.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Didit webhook error:", error);

    return NextResponse.json(
      { success: false, message: "Invalid webhook request." },
      { status: 400 }
    );
  }
}