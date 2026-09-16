import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log("Didit webhook received:", body);

    // TODO:
    // We will connect this to Supabase after confirming
    // the exact Didit webhook payload.

    return NextResponse.json(
      {
        success: true,
        message: "Didit webhook received successfully",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Didit webhook error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Invalid webhook request",
      },
      { status: 400 }
    );
  }
}