import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function getAdminUser(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const accessToken = authorization.replace("Bearer ", "").trim();

  if (!accessToken) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, account_type")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.account_type !== "admin") {
    return null;
  }

  return user;
}

export async function GET(request: NextRequest) {
  try {
    const adminUser = await getAdminUser(request);

    if (!adminUser) {
      return NextResponse.json(
        { error: "Unauthorized. Admin access required." },
        { status: 401 }
      );
    }

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, full_name, phone, account_type, university, business_name, created_at"
      )
      .in("account_type", ["student", "owner"])
      .order("created_at", { ascending: false });

    if (profilesError) {
      return NextResponse.json(
        { error: profilesError.message },
        { status: 500 }
      );
    }

    const userIds = (profiles || []).map((profile) => profile.id);

    let warnings: any[] = [];

    if (userIds.length > 0) {
      const { data: warningData, error: warningsError } =
        await supabaseAdmin
          .from("user_warnings")
          .select("id, user_id, reason, created_at")
          .in("user_id", userIds)
          .order("created_at", { ascending: false });

      if (warningsError) {
        return NextResponse.json(
          { error: warningsError.message },
          { status: 500 }
        );
      }

      warnings = warningData || [];
    }

    const warningCountByUser: Record<string, number> = {};
    const latestWarningByUser: Record<string, any> = {};

    for (const warning of warnings) {
      warningCountByUser[warning.user_id] =
        (warningCountByUser[warning.user_id] || 0) + 1;

      if (!latestWarningByUser[warning.user_id]) {
        latestWarningByUser[warning.user_id] = warning;
      }
    }

    const users = (profiles || []).map((profile) => ({
      ...profile,
      warning_count: warningCountByUser[profile.id] || 0,
      latest_warning: latestWarningByUser[profile.id] || null,
      status: warningCountByUser[profile.id] ? "Warned" : "Active",
    }));

    return NextResponse.json({
      users,
      students: users.filter((user) => user.account_type === "student"),
      owners: users.filter((user) => user.account_type === "owner"),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || "Failed to load users.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminUser = await getAdminUser(request);

    if (!adminUser) {
      return NextResponse.json(
        { error: "Unauthorized. Admin access required." },
        { status: 401 }
      );
    }

    const body = await request.json();

    const action = body?.action;
    const userId = body?.userId;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required." },
        { status: 400 }
      );
    }

    if (userId === adminUser.id) {
      return NextResponse.json(
        { error: "You cannot perform this action on your own admin account." },
        { status: 400 }
      );
    }

    const { data: targetProfile, error: targetProfileError } =
      await supabaseAdmin
        .from("profiles")
        .select("id, full_name, account_type")
        .eq("id", userId)
        .maybeSingle();

    if (targetProfileError) {
      return NextResponse.json(
        { error: targetProfileError.message },
        { status: 500 }
      );
    }

    if (!targetProfile) {
      return NextResponse.json(
        { error: "User profile not found." },
        { status: 404 }
      );
    }

    if (
      targetProfile.account_type !== "student" &&
      targetProfile.account_type !== "owner"
    ) {
      return NextResponse.json(
        { error: "Only student and owner accounts can be managed here." },
        { status: 400 }
      );
    }

    if (action === "warn") {
      const reason =
        typeof body?.reason === "string" ? body.reason.trim() : "";

      if (!reason) {
        return NextResponse.json(
          { error: "A warning reason is required." },
          { status: 400 }
        );
      }

      const { data: warning, error: warningError } = await supabaseAdmin
        .from("user_warnings")
        .insert({
          user_id: userId,
          admin_id: adminUser.id,
          reason,
        })
        .select("*")
        .single();

      if (warningError) {
        return NextResponse.json(
          { error: warningError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Warning issued successfully.",
        warning,
      });
    }

    if (action === "delete") {
      const { error: deleteError } =
        await supabaseAdmin.auth.admin.deleteUser(userId);

      if (deleteError) {
        return NextResponse.json(
          {
            error:
              deleteError.message ||
              "The account could not be deleted.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "User account deleted successfully.",
      });
    }

    return NextResponse.json(
      {
        error: "Invalid action. Use 'warn' or 'delete'.",
      },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || "Admin action failed.",
      },
      { status: 500 }
    );
  }
}