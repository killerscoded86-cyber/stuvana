import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.DIDIT_API_KEY;
    const workflowId = process.env.DIDIT_WORKFLOW_ID;

    if (!apiKey || !workflowId) {
      return NextResponse.json(
        { error: "Didit environment variables are missing" },
        { status: 500 }
      );
    }

    const response = await fetch(
      "https://verification.didit.me/v3/session/",
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflow_id: workflowId,
          vendor_data: userId,
          callback: "https://stuvana.netlify.app/owner/verification",
          callback_method: "both",
          language: "en",
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Didit session creation failed:", data);

      return NextResponse.json(
        { error: "Failed to create Didit session", details: data },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      session_id: data.session_id,
      url: data.url,
    });
  } catch (error) {
    console.error("Didit create session error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}