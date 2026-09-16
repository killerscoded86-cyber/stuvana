"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type PropertyMedia = {
  id: number;
  property_id: number;
  media_type: "image" | "video";
  storage_path: string;
  public_url: string;
  sort_order: number;
};

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [adminProperties, setAdminProperties] = useState<any[]>([]);
  const [adminMedia, setAdminMedia] = useState<
    Record<number, PropertyMedia[]>
  >({});
  const [loadingAdminProperties, setLoadingAdminProperties] =
    useState(false);
  const [processingPropertyId, setProcessingPropertyId] =
    useState<number | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUser(user);

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Profile error:", error);
      }

      setProfile(profile);

      if (profile?.account_type === "admin") {
        await loadAdminProperties();
      }

      setLoading(false);
    }

    loadDashboard();
  }, [router]);

  async function loadAdminProperties() {
    setLoadingAdminProperties(true);

    try {
      const {
        data: pendingProperties,
        error: propertyError,
      } = await supabase
        .from("properties")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (propertyError) {
        console.error(
          "Admin properties error:",
          propertyError
        );

        alert(
          propertyError.message ||
            "Could not load pending properties."
        );

        return;
      }

      const loadedProperties = pendingProperties || [];

      setAdminProperties(loadedProperties);

      if (loadedProperties.length === 0) {
        setAdminMedia({});
        return;
      }

      const propertyIds = loadedProperties.map(
        (property) => property.id
      );

      const {
        data: mediaData,
        error: mediaError,
      } = await supabase
        .from("property_media")
        .select("*")
        .in("property_id", propertyIds)
        .order("sort_order", {
          ascending: true,
        });

      if (mediaError) {
        console.error(
          "Admin property media error:",
          mediaError
        );

        return;
      }

      const groupedMedia: Record<
        number,
        PropertyMedia[]
      > = {};

      (mediaData || []).forEach((item) => {
        if (!groupedMedia[item.property_id]) {
          groupedMedia[item.property_id] = [];
        }

        groupedMedia[item.property_id].push(item);
      });

      setAdminMedia(groupedMedia);
    } finally {
      setLoadingAdminProperties(false);
    }
  }

  async function updatePropertyStatus(
    propertyId: number,
    status: "approved" | "rejected"
  ) {
    const action =
      status === "approved"
        ? "approve"
        : "reject";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} this property?`
    );

    if (!confirmed) return;

    setProcessingPropertyId(propertyId);

    try {
      const { error } = await supabase
        .from("properties")
        .update({
          status,
        })
        .eq("id", propertyId);

      if (error) {
        console.error(
          "Update property status error:",
          error
        );

        alert(
          error.message ||
            "Could not update the property status."
        );

        return;
      }

      setAdminProperties((current) =>
        current.filter(
          (property) => property.id !== propertyId
        )
      );

      setAdminMedia((current) => {
        const updated = { ...current };
        delete updated[propertyId];
        return updated;
      });

      alert(
        status === "approved"
          ? "Property approved successfully."
          : "Property rejected successfully."
      );
    } finally {
      setProcessingPropertyId(null);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-header">
          <h1>Loading your dashboard...</h1>
        </div>
      </main>
    );
  }

  const accountType =
    profile?.account_type || "student";

  const fullName =
    profile?.full_name || "User";

  // =========================
  // ADMIN DASHBOARD
  // =========================

  if (accountType === "admin") {
    return (
      <main className="dashboard-page">
        <nav className="dashboard-nav">
          <a href="/" className="logo">
            STUVANA
          </a>

          <button onClick={handleLogout}>
            Log Out
          </button>
        </nav>

        <section className="dashboard-header">
          <p className="hero-label">
            ADMINISTRATION
          </p>

          <h1>Admin Dashboard</h1>

          <p>
            Welcome back, {fullName}.
          </p>
        </section>

        <section
          style={{
            width: "100%",
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "0 20px 60px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "16px",
              flexWrap: "wrap",
              marginBottom: "24px",
            }}
          >
            <div>
              <p className="hero-label">
                PROPERTY REVIEW
              </p>

              <h2>
                Pending Properties
              </h2>
            </div>

            <button
              type="button"
              onClick={loadAdminProperties}
              disabled={loadingAdminProperties}
            >
              {loadingAdminProperties
                ? "Refreshing..."
                : "Refresh"}
            </button>
          </div>

          {loadingAdminProperties ? (
            <p>Loading pending properties...</p>
          ) : adminProperties.length === 0 ? (
            <div className="owner-empty-state">
              <div className="owner-empty-icon">
                ✅
              </div>

              <h3>
                No pending properties
              </h3>

              <p>
                New owner submissions will appear here
                for review.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "24px",
              }}
            >
              {adminProperties.map((property) => {
                const media =
                  adminMedia[property.id] || [];

                const images = media.filter(
                  (item) =>
                    item.media_type === "image"
                );

                const videos = media.filter(
                  (item) =>
                    item.media_type === "video"
                );

                const coverImage =
                  images.find(
                    (image) =>
                      image.public_url ===
                      property.image_url
                  ) || images[0];

                const isProcessing =
                  processingPropertyId ===
                  property.id;

                return (
                  <article
                    key={property.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: "16px",
                      padding: "20px",
                      background: "#ffffff",
                      boxShadow:
                        "0 4px 16px rgba(0,0,0,0.05)",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(260px, 380px) 1fr",
                        gap: "24px",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            width: "100%",
                            aspectRatio: "4 / 3",
                            borderRadius: "12px",
                            overflow: "hidden",
                            background: "#f3f4f6",
                          }}
                        >
                          {coverImage ? (
                            <img
                              src={coverImage.public_url}
                              alt={property.name}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "48px",
                              }}
                            >
                              🏠
                            </div>
                          )}
                        </div>

                        {images.length > 0 && (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(3, 1fr)",
                              gap: "8px",
                              marginTop: "10px",
                            }}
                          >
                            {images.map((image) => (
                              <img
                                key={image.id}
                                src={image.public_url}
                                alt={property.name}
                                style={{
                                  width: "100%",
                                  aspectRatio: "1",
                                  objectFit: "cover",
                                  borderRadius: "8px",
                                }}
                              />
                            ))}
                          </div>
                        )}

                        {videos.length > 0 && (
                          <p
                            style={{
                              marginTop: "12px",
                              fontSize: "14px",
                            }}
                          >
                            🎥{" "}
                            {videos.length} video
                            {videos.length > 1
                              ? "s"
                              : ""}{" "}
                            submitted
                          </p>
                        )}
                      </div>

                      <div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent:
                              "space-between",
                            gap: "12px",
                            alignItems:
                              "flex-start",
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <p
                              style={{
                                margin: 0,
                                fontSize: "13px",
                                fontWeight: 700,
                                color: "#92400e",
                                textTransform:
                                  "uppercase",
                              }}
                            >
                              Pending Approval
                            </p>

                            <h3
                              style={{
                                marginTop: "8px",
                              }}
                            >
                              {property.name}
                            </h3>
                          </div>
                        </div>

                        <p>
                          📍 {property.location}
                        </p>

                        <p>
                          🏫{" "}
                          {property.university ||
                            "University not specified"}
                        </p>

                        <div
                          style={{
                            display: "flex",
                            gap: "12px",
                            flexWrap: "wrap",
                            margin:
                              "12px 0",
                          }}
                        >
                          <span>
                            🏠{" "}
                            {property.room_type}
                          </span>

                          <span>
                            👥{" "}
                            {property.spaces} spaces
                          </span>

                          <span>
                            💰 GH₵{" "}
                            {Number(
                              property.price
                            ).toLocaleString()}{" "}
                            {property.period}
                          </span>
                        </div>

                        {property.walking_minutes && (
                          <p>
                            🚶{" "}
                            {property.walking_minutes}{" "}
                            mins walk to campus
                          </p>
                        )}

                        {property.description && (
                          <div
                            style={{
                              marginTop: "16px",
                            }}
                          >
                            <strong>
                              Description
                            </strong>

                            <p>
                              {
                                property.description
                              }
                            </p>
                          </div>
                        )}

                        <div
                          style={{
                            display: "flex",
                            gap: "12px",
                            flexWrap: "wrap",
                            marginTop: "24px",
                          }}
                        >
                          <button
                            type="button"
                            disabled={
                              isProcessing
                            }
                            onClick={() =>
                              updatePropertyStatus(
                                property.id,
                                "approved"
                              )
                            }
                            style={{
                              cursor:
                                isProcessing
                                  ? "not-allowed"
                                  : "pointer",
                            }}
                          >
                            {isProcessing
                              ? "Processing..."
                              : "✓ Approve Property"}
                          </button>

                          <button
                            type="button"
                            disabled={
                              isProcessing
                            }
                            onClick={() =>
                              updatePropertyStatus(
                                property.id,
                                "rejected"
                              )
                            }
                            style={{
                              cursor:
                                isProcessing
                                  ? "not-allowed"
                                  : "pointer",
                            }}
                          >
                            {isProcessing
                              ? "Processing..."
                              : "✕ Reject Property"}
                          </button>

                          <button
                            type="button"
                            disabled={
                              isProcessing
                            }
                            onClick={() =>
                              router.push(
                                `/property/${property.id}`
                              )
                            }
                          >
                            View Property
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    );
  }

  // =========================
  // PROPERTY OWNER DASHBOARD
  // =========================

  if (accountType === "owner") {
    return (
      <main className="dashboard-page">
        <nav className="dashboard-nav">
          <a href="/" className="logo">
            STUVANA
          </a>

          <button onClick={handleLogout}>
            Log Out
          </button>
        </nav>

        <section className="dashboard-header">
          <p className="hero-label">
            PROPERTY OWNER
          </p>

          <h1>
            Property Owner Dashboard
          </h1>

          <p>
            Welcome back, {fullName}.
          </p>
        </section>

        <section className="dashboard-grid">
          <div className="dashboard-card">
            <h2>🏠 My Properties</h2>

            <p>
              Manage your accommodation listings.
            </p>

            <button
              type="button"
              onClick={() =>
                router.push("/owner/dashboard")
              }
            >
              Manage Properties
            </button>
          </div>

          <div className="dashboard-card">
            <h2>➕ Add Accommodation</h2>

            <p>
              List a new student accommodation.
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/owner/add-property"
                )
              }
            >
              Add Property
            </button>
          </div>

          <div className="dashboard-card">
            <h2>👨‍🎓 Interested Students</h2>

            <p>
              View students interested in your
              properties.
            </p>

            <button
              type="button"
              onClick={() =>
                alert(
                  "Student interest management is coming soon."
                )
              }
            >
              View Students
            </button>
          </div>
        </section>
      </main>
    );
  }

  // =========================
  // STUDENT DASHBOARD
  // =========================

  return (
    <main className="dashboard-page">
      <nav className="dashboard-nav">
        <a href="/" className="logo">
          STUVANA
        </a>

        <button onClick={handleLogout}>
          Log Out
        </button>
      </nav>

      <section className="dashboard-header">
        <p className="hero-label">
          STUDENT ACCOUNT
        </p>

        <h1>Student Dashboard</h1>

        <p>
          Welcome back, {fullName}.
        </p>
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-card">
          <h2>🔍 Find Accommodation</h2>

          <p>
            Search verified student accommodation.
          </p>

          <a href="/#housing">
            <button>Find Housing</button>
          </a>
        </div>

        <div className="dashboard-card">
          <h2>♡ Saved Properties</h2>

          <p>
            View accommodation you have saved.
          </p>

          <button
            type="button"
            onClick={() =>
              router.push("/saved")
            }
          >
            View Saved
          </button>
        </div>

        <div className="dashboard-card">
          <h2>👤 My Profile</h2>

          <p>
            View and manage your account
            information.
          </p>

          <button
            type="button"
            onClick={() =>
              router.push("/profile")
            }
          >
            View Profile
          </button>
        </div>
      </section>
    </main>
  );
}