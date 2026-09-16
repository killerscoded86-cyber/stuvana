"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function ProfilePage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [university, setUniversity] = useState("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUser(user);

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("Profile error:", profileError);
      }

      if (!profile) {
        console.error(
          "No profile row was found for this user."
        );

        setMessage(
          "Your profile could not be found. Please contact STUVANA support."
        );

        setLoading(false);
        return;
      }

      setProfile(profile);

      setFullName(profile.full_name || "");
      setPhone(profile.phone || "");
      setUniversity(profile.university || "");

      setLoading(false);
    }

    loadProfile();
  }, [router]);

  async function handleSaveProfile() {
    setMessage("");

    const trimmedName = fullName.trim();
    const trimmedPhone = phone.trim();
    const trimmedUniversity = university.trim();

    if (!trimmedName) {
      setMessage("Please enter your full name.");
      return;
    }

    if (
      profile?.account_type === "student" &&
      !trimmedPhone
    ) {
      setMessage(
        "Phone number is required for student accounts."
      );
      return;
    }

    if (
      profile?.account_type === "student" &&
      !trimmedUniversity
    ) {
      setMessage(
        "Please select your university."
      );
      return;
    }

    setSaving(true);

    try {
      const {
        data: updatedProfile,
        error,
      } = await supabase
        .from("profiles")
        .update({
          full_name: trimmedName,
          phone: trimmedPhone,
          university:
            trimmedUniversity || null,
        })
        .eq("id", user.id)
        .select("*")
        .maybeSingle();

      if (error) {
        console.error(
          "Profile update error:",
          error
        );

        setMessage(
          error.message ||
            "Could not update your profile."
        );

        return;
      }

      if (!updatedProfile) {
        console.error(
          "Profile update returned no profile row."
        );

        setMessage(
          "Your profile could not be updated. Please make sure your account profile exists."
        );

        return;
      }

      setProfile(updatedProfile);

      setFullName(
        updatedProfile.full_name || ""
      );

      setPhone(
        updatedProfile.phone || ""
      );

      setUniversity(
        updatedProfile.university || ""
      );

      setMessage(
        "Profile updated successfully."
      );
    } catch (error) {
      console.error(
        "Unexpected profile update error:",
        error
      );

      setMessage(
        "Something went wrong while updating your profile."
      );
    } finally {
      setSaving(false);
    }
  }

  function getVerificationStatus() {
    return String(
      profile?.verification_status ||
        "unverified"
    ).toLowerCase();
  }

  function getVerificationLabel() {
    const status =
      getVerificationStatus();

    if (status === "verified") {
      return "Verified";
    }

    if (status === "pending") {
      return "Verification Pending";
    }

    if (status === "rejected") {
      return "Verification Rejected";
    }

    return "Not Verified";
  }

  function getVerificationStyle() {
    const status =
      getVerificationStatus();

    if (status === "verified") {
      return {
        background: "#dcfce7",
        color: "#166534",
        border: "1px solid #bbf7d0",
      };
    }

    if (status === "pending") {
      return {
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #fde68a",
      };
    }

    if (status === "rejected") {
      return {
        background: "#fee2e2",
        color: "#991b1b",
        border: "1px solid #fecaca",
      };
    }

    return {
      background: "#f3f4f6",
      color: "#374151",
      border: "1px solid #d1d5db",
    };
  }

  if (loading) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-header">
          <h1>Loading profile...</h1>
        </div>
      </main>
    );
  }

  const isOwner =
    profile?.account_type === "owner";

  const verificationStatus =
    getVerificationStatus();

  const verificationStyle =
    getVerificationStyle();

  return (
    <main className="dashboard-page">
      <nav className="dashboard-nav">
        <a href="/" className="logo">
          STUVANA
        </a>

        <button
          onClick={() =>
            router.push("/dashboard")
          }
        >
          Dashboard
        </button>
      </nav>

      <section className="dashboard-header">
        <p className="hero-label">
          MY ACCOUNT
        </p>

        <h1>My Profile</h1>

        <p>
          Manage your STUVANA account information.
        </p>
      </section>

      <section className="profile-container">
        <div className="profile-card">
          <div
            className="profile-avatar"
            style={{
              overflow: "hidden",
              position: "relative",
            }}
          >
            {profile?.profile_photo_url ? (
              <img
                src={profile.profile_photo_url}
                alt="Profile"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              fullName
                ?.charAt(0)
                ?.toUpperCase() || "U"
            )}
          </div>

          <h2>
            {fullName || "User"}
          </h2>

          <p className="profile-account-type">
            {profile?.account_type ===
            "owner"
              ? "Property Owner"
              : profile?.account_type ===
                "admin"
              ? "Administrator"
              : "Student"}
          </p>

          <div
            style={{
              display: "grid",
              gap: "18px",
              marginTop: "24px",
              textAlign: "left",
            }}
          >
            {/* FULL NAME */}
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "7px",
                  fontWeight: 700,
                }}
              >
                Full Name
              </label>

              <input
                type="text"
                value={fullName}
                onChange={(event) =>
                  setFullName(
                    event.target.value
                  )
                }
                placeholder="Enter your full name"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border:
                    "1px solid #d1d5db",
                  fontSize: "15px",
                }}
              />
            </div>

            {/* EMAIL */}
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "7px",
                  fontWeight: 700,
                }}
              >
                Email
              </label>

              <input
                type="email"
                value={user?.email || ""}
                disabled
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border:
                    "1px solid #d1d5db",
                  fontSize: "15px",
                  background: "#f3f4f6",
                  color: "#6b7280",
                }}
              />

              <p
                style={{
                  marginTop: "6px",
                  fontSize: "12px",
                  color: "#777",
                }}
              >
                Your login email cannot be
                changed here.
              </p>
            </div>

            {/* PHONE */}
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "7px",
                  fontWeight: 700,
                }}
              >
                Phone Number

                {profile?.account_type ===
                  "student" && (
                  <span
                    style={{
                      color: "#dc2626",
                    }}
                  >
                    {" "}
                    *
                  </span>
                )}
              </label>

              <input
                type="tel"
                value={phone}
                onChange={(event) =>
                  setPhone(
                    event.target.value
                  )
                }
                placeholder="Enter your phone number"
                required={
                  profile?.account_type ===
                  "student"
                }
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border:
                    profile?.account_type ===
                      "student" &&
                    !phone.trim()
                      ? "1px solid #dc2626"
                      : "1px solid #d1d5db",
                  fontSize: "15px",
                }}
              />

              {profile?.account_type ===
                "student" && (
                <p
                  style={{
                    marginTop: "6px",
                    fontSize: "12px",
                    color: "#666",
                  }}
                >
                  Required so property
                  owners can contact you
                  about your accommodation.
                </p>
              )}
            </div>

            {/* UNIVERSITY */}
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "7px",
                  fontWeight: 700,
                }}
              >
                University

                {profile?.account_type ===
                  "student" && (
                  <span
                    style={{
                      color: "#dc2626",
                    }}
                  >
                    {" "}
                    *
                  </span>
                )}
              </label>

              <select
                value={university}
                onChange={(event) =>
                  setUniversity(
                    event.target.value
                  )
                }
                required={
                  profile?.account_type ===
                  "student"
                }
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border:
                    "1px solid #d1d5db",
                  fontSize: "15px",
                  background: "#ffffff",
                }}
              >
                <option value="">
                  Select your university
                </option>

                <option value="UPSA">
                  University of Professional
                  Studies, Accra (UPSA)
                </option>

                <option value="University of Ghana">
                  University of Ghana
                </option>

                <option value="KNUST">
                  Kwame Nkrumah University
                  of Science and Technology
                </option>

                <option value="University of Cape Coast">
                  University of Cape Coast
                </option>

                <option value="Accra Technical University">
                  Accra Technical University
                </option>

                <option value="GIMPA">
                  Ghana Institute of Management
                  and Public Administration
                </option>
              </select>
            </div>

            {/* ACCOUNT TYPE */}
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "7px",
                  fontWeight: 700,
                }}
              >
                Account Type
              </label>

              <input
                type="text"
                value={
                  profile?.account_type ===
                  "owner"
                    ? "Property Owner"
                    : profile?.account_type ===
                      "admin"
                    ? "Administrator"
                    : "Student"
                }
                disabled
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border:
                    "1px solid #d1d5db",
                  fontSize: "15px",
                  background: "#f3f4f6",
                  color: "#6b7280",
                }}
              />
            </div>
          </div>

          {/* =========================
              OWNER VERIFICATION
          ========================= */}

          {isOwner && (
            <div
              style={{
                marginTop: "28px",
                padding: "20px",
                borderRadius: "16px",
                background: "#f8fafc",
                border:
                  "1px solid #e2e8f0",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems: "flex-start",
                  gap: "15px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <p
                    className="hero-label"
                    style={{
                      margin: 0,
                    }}
                  >
                    OWNER SECURITY
                  </p>

                  <h3
                    style={{
                      marginTop: "6px",
                      marginBottom: "6px",
                    }}
                  >
                    Identity Verification
                  </h3>

                  <p
                    style={{
                      margin: 0,
                      color: "#666",
                      fontSize: "14px",
                      lineHeight: 1.5,
                    }}
                  >
                    Owner identity verification
                    is required before you can
                    upload or publish a property.
                  </p>
                </div>

                <span
                  style={{
                    ...verificationStyle,
                    padding: "8px 12px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                  }}
                >
                  {getVerificationLabel()}
                </span>
              </div>

              <div
                style={{
                  marginTop: "18px",
                  display: "grid",
                  gap: "10px",
                  fontSize: "14px",
                }}
              >
                <div>
                  <strong>
                    Profile Photo:
                  </strong>{" "}
                  {profile?.profile_photo_url
                    ? "Added"
                    : "Required"}
                </div>

                <div>
                  <strong>
                    Identity Check:
                  </strong>{" "}
                  {verificationStatus ===
                  "verified"
                    ? "Verified"
                    : verificationStatus ===
                      "pending"
                    ? "Under review"
                    : verificationStatus ===
                      "rejected"
                    ? "Rejected"
                    : "Not completed"}
                </div>
              </div>

              {verificationStatus ===
                "rejected" &&
                profile?.verification_rejection_reason && (
                  <div
                    style={{
                      marginTop: "14px",
                      padding: "12px 14px",
                      borderRadius: "10px",
                      background: "#fef2f2",
                      border:
                        "1px solid #fecaca",
                      color: "#991b1b",
                      fontSize: "14px",
                    }}
                  >
                    <strong>
                      Reason:
                    </strong>{" "}
                    {
                      profile.verification_rejection_reason
                    }
                  </div>
                )}

              {verificationStatus !==
                "verified" && (
                <button
                  type="button"
                  className="details-primary-button"
                  onClick={() =>
                    router.push(
                      "/owner/verification"
                    )
                  }
                  style={{
                    marginTop: "18px",
                    width: "100%",
                  }}
                >
                  {verificationStatus ===
                  "pending"
                    ? "View Verification"
                    : "Verify My Identity"}
                </button>
              )}

              {verificationStatus ===
                "verified" && (
                <div
                  style={{
                    marginTop: "18px",
                    padding: "14px",
                    borderRadius: "12px",
                    background:
                      "#f0fdf4",
                    border:
                      "1px solid #bbf7d0",
                    color: "#166534",
                    fontSize: "14px",
                    lineHeight: 1.5,
                  }}
                >
                  ✓ Your identity has been
                  verified. You can now submit
                  properties for approval.
                </div>
              )}
            </div>
          )}

          {/* MESSAGE */}
          {message && (
            <div
              style={{
                marginTop: "18px",
                padding: "12px 14px",
                borderRadius: "10px",
                background:
                  message.includes(
                    "successfully"
                  )
                    ? "#f0fdf4"
                    : "#fef2f2",
                border:
                  message.includes(
                    "successfully"
                  )
                    ? "1px solid #bbf7d0"
                    : "1px solid #fecaca",
                color:
                  message.includes(
                    "successfully"
                  )
                    ? "#166534"
                    : "#991b1b",
                fontSize: "14px",
                lineHeight: 1.5,
              }}
            >
              {message}
            </div>
          )}

          {/* SAVE */}
          <button
            type="button"
            className="details-primary-button"
            onClick={handleSaveProfile}
            disabled={saving}
            style={{
              marginTop: "20px",
              width: "100%",
            }}
          >
            {saving
              ? "Saving..."
              : "Save Changes"}
          </button>

          {/* BACK */}
          <button
            type="button"
            className="profile-back-button"
            onClick={() =>
              router.push("/dashboard")
            }
            style={{
              marginTop: "12px",
            }}
          >
            ← Back to Dashboard
          </button>
        </div>
      </section>
    </main>
  );
}