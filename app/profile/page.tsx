"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function ProfilePage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Profile error:", error);
      }

      setProfile(profile);
      setLoading(false);
    }

    loadProfile();
  }, [router]);

  if (loading) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-header">
          <h1>Loading profile...</h1>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <nav className="dashboard-nav">
        <a href="/" className="logo">
          STUVANA
        </a>

        <button onClick={() => router.push("/dashboard")}>
          Dashboard
        </button>
      </nav>

      <section className="dashboard-header">
        <p className="hero-label">MY ACCOUNT</p>

        <h1>My Profile</h1>

        <p>
          View your STUVANA account information.
        </p>
      </section>

      <section className="profile-container">
        <div className="profile-card">
          <div className="profile-avatar">
            {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
          </div>

          <h2>{profile?.full_name || "User"}</h2>

          <p className="profile-account-type">
            {profile?.account_type === "owner"
              ? "Property Owner"
              : profile?.account_type === "admin"
              ? "Administrator"
              : "Student"}
          </p>

          <div className="profile-details">
            <div className="profile-detail">
              <span>📧 Email</span>
              <strong>{user?.email || "Not available"}</strong>
            </div>

            <div className="profile-detail">
              <span>📱 Phone Number</span>
              <strong>{profile?.phone || "Not provided"}</strong>
            </div>

            <div className="profile-detail">
              <span>🎓 University</span>
              <strong>
                {profile?.university || "Not provided"}
              </strong>
            </div>

            <div className="profile-detail">
              <span>👤 Account Type</span>
              <strong>
                {profile?.account_type === "owner"
                  ? "Property Owner"
                  : profile?.account_type === "admin"
                  ? "Administrator"
                  : "Student"}
              </strong>
            </div>
          </div>

          <button
            className="profile-back-button"
            onClick={() => router.push("/dashboard")}
          >
            ← Back to Dashboard
          </button>
        </div>
      </section>
    </main>
  );
}