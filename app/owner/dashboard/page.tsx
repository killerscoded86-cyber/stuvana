"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profileData, error: profileError } =
        await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

      if (profileError || !profileData) {
        console.error("Profile error:", profileError);
        setLoading(false);
        return;
      }

      setProfile(profileData);

      if (profileData.account_type === "owner") {
        const { data: propertyData, error: propertyError } =
          await supabase
            .from("properties")
            .select("*")
            .eq("owner_id", user.id)
            .order("created_at", { ascending: false });

        if (propertyError) {
          console.error("Properties error:", propertyError);
        }

        setProperties(propertyData || []);
      }

      setLoading(false);
    }

    loadDashboard();
  }, [router]);

  async function deleteProperty(id: number) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this property?"
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("properties")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Delete property error:", error);
      alert("Could not delete this property.");
      return;
    }

    setProperties((current) =>
      current.filter((property) => property.id !== id)
    );
  }

  function getPropertyStatus(property: any) {
    const status = String(property?.status || "pending").toLowerCase();

    if (
      status === "approved" ||
      status === "published" ||
      status === "active"
    ) {
      return "approved";
    }

    if (
      status === "rejected" ||
      status === "declined"
    ) {
      return "rejected";
    }

    return "pending";
  }

  function getStatusLabel(property: any) {
    const status = getPropertyStatus(property);

    if (status === "approved") {
      return "Approved";
    }

    if (status === "rejected") {
      return "Rejected";
    }

    return "Pending Approval";
  }

  if (loading) {
    return (
      <main className="dashboard-page">
        <section className="dashboard-header">
          <p className="hero-label">STUVANA</p>
          <h1>Loading dashboard...</h1>
        </section>
      </main>
    );
  }

  // =========================
  // OWNER DASHBOARD
  // =========================

  if (profile?.account_type === "owner") {
    return (
      <main className="dashboard-page">
        <nav className="dashboard-nav">
          <a href="/" className="logo">
            STUVANA
          </a>

          <div className="dashboard-nav-actions">
            <button onClick={() => router.push("/")}>
              Home
            </button>

            <button onClick={() => router.push("/profile")}>
              My Profile
            </button>
          </div>
        </nav>

        <section className="dashboard-header">
          <p className="hero-label">PROPERTY OWNER</p>

          <h1>
            Welcome, {profile?.full_name || "Property Owner"}
          </h1>

          <p>
            Manage your student accommodation listings from one place.
          </p>

          <div
            className="owner-dashboard-actions"
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              marginTop: "24px",
            }}
          >
            <a
              href="/owner/add-property"
              className="details-primary-button"
              style={{
                cursor: "pointer",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              + Add Property
            </a>

            <button
              type="button"
              className="details-secondary-button"
              onClick={() =>
                router.push("/owner/payout")
              }
              style={{
                cursor: "pointer",
              }}
            >
              💰 Withdraw Earnings
            </button>

            <button
              type="button"
              className="details-secondary-button"
              onClick={() =>
                router.push("/owner/payout-account")
              }
              style={{
                cursor: "pointer",
              }}
            >
              💳 Payout Account
            </button>
          </div>
        </section>

        <section className="owner-properties-section">
          <div className="owner-section-heading">
            <div>
              <p className="hero-label">MY LISTINGS</p>
              <h2>Your Properties</h2>
            </div>

            <span>
              {properties.length}{" "}
              {properties.length === 1
                ? "property"
                : "properties"}
            </span>
          </div>

          {properties.length === 0 ? (
            <div className="owner-empty-state">
              <div className="owner-empty-icon">
                🏠
              </div>

              <h3>No properties yet</h3>

              <p>
                You haven't added any accommodation listings yet.
              </p>

              <a
                href="/owner/add-property"
                className="details-primary-button"
                style={{
                  cursor: "pointer",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                + Add Your First Property
              </a>
            </div>
          ) : (
            <div className="owner-properties-grid">
              {properties.map((property) => {
                const status = getPropertyStatus(property);
                const statusLabel = getStatusLabel(property);

                return (
                  <article
                    className="owner-property-card"
                    key={property.id}
                  >
                    <div className="owner-property-image">
                      {property.image_url ? (
                        <img
                          src={property.image_url}
                          alt={property.name}
                        />
                      ) : (
                        <div className="owner-property-placeholder">
                          🏠
                        </div>
                      )}

                      <div
                        style={{
                          position: "absolute",
                          top: "12px",
                          right: "12px",
                          padding: "7px 11px",
                          borderRadius: "999px",
                          background:
                            status === "approved"
                              ? "#dcfce7"
                              : status === "rejected"
                              ? "#fee2e2"
                              : "#fef3c7",
                          color:
                            status === "approved"
                              ? "#166534"
                              : status === "rejected"
                              ? "#991b1b"
                              : "#92400e",
                          fontSize: "12px",
                          fontWeight: 700,
                          lineHeight: 1,
                          zIndex: 2,
                        }}
                      >
                        {statusLabel}
                      </div>
                    </div>

                    <div className="owner-property-content">
                      <p className="owner-property-location">
                        📍 {property.location}
                      </p>

                      <h3>{property.name}</h3>

                      <p className="owner-property-price">
                        GH₵{" "}
                        {Number(
                          property.price
                        ).toLocaleString()}
                        <span>
                          {" "}
                          {property.period}
                        </span>
                      </p>

                      <div className="owner-property-info">
                        <span>
                          🏠 {property.room_type}
                        </span>

                        <span>
                          👥 {property.spaces} spaces
                        </span>
                      </div>

                      {property.walking_minutes && (
                        <p className="walking-distance">
                          🚶 {property.walking_minutes} mins
                          walk to campus
                        </p>
                      )}

                      {status === "pending" && (
                        <p
                          style={{
                            marginTop: "12px",
                            fontSize: "14px",
                            lineHeight: 1.5,
                            color: "#92400e",
                          }}
                        >
                          Your property has been submitted
                          and is waiting for admin approval.
                        </p>
                      )}

                      {status === "rejected" && (
                        <p
                          style={{
                            marginTop: "12px",
                            fontSize: "14px",
                            lineHeight: 1.5,
                            color: "#991b1b",
                          }}
                        >
                          Your property was not approved.
                          You can edit the listing and update
                          its details.
                        </p>
                      )}

                      {status === "approved" && (
                        <p
                          style={{
                            marginTop: "12px",
                            fontSize: "14px",
                            lineHeight: 1.5,
                            color: "#166534",
                          }}
                        >
                          Your property has been approved
                          and is available to students.
                        </p>
                      )}

                      <div className="owner-property-actions">
                        <button
                          onClick={() =>
                            router.push(
                              `/property/${property.id}`
                            )
                          }
                        >
                          View
                        </button>

                        <button
                          onClick={() =>
                            router.push(
                              `/owner/edit-property/${property.id}`
                            )
                          }
                        >
                          Edit
                        </button>

                        <button
                          className="delete-property-button"
                          onClick={() =>
                            deleteProperty(property.id)
                          }
                        >
                          Delete
                        </button>
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
  // STUDENT DASHBOARD
  // =========================

  return (
    <main className="dashboard-page">
      <nav className="dashboard-nav">
        <a href="/" className="logo">
          STUVANA
        </a>

        <div className="dashboard-nav-actions">
          <button onClick={() => router.push("/")}>
            Home
          </button>

          <button onClick={() => router.push("/profile")}>
            My Profile
          </button>
        </div>
      </nav>

      <section className="dashboard-header">
        <p className="hero-label">STUDENT ACCOUNT</p>

        <h1>
          Welcome, {profile?.full_name || "Student"}
        </h1>

        <p>
          Find and save student accommodation that works for you.
        </p>

        <div className="owner-dashboard-actions">
          <button
            className="details-primary-button"
            onClick={() => router.push("/saved")}
          >
            View Saved Properties
          </button>

          <button
            className="details-secondary-button"
            onClick={() => router.push("/")}
          >
            Find Housing
          </button>
        </div>
      </section>
    </main>
  );
}