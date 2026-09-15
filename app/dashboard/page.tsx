"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
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

    loadDashboard();
  }, [router]);

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

  const accountType = profile?.account_type || "student";
  const fullName = profile?.full_name || "User";

  // ADMIN DASHBOARD
  if (accountType === "admin") {
    return (
      <main className="dashboard-page">
        <nav className="dashboard-nav">
          <a href="/" className="logo">
            STUVANA
          </a>

          <button onClick={handleLogout}>Log Out</button>
        </nav>

        <section className="dashboard-header">
          <p className="hero-label">ADMINISTRATION</p>

          <h1>Admin Dashboard</h1>

          <p>Welcome back, {fullName}.</p>
        </section>

        <section className="dashboard-grid">
          <div className="dashboard-card">
            <h2>👥 Manage Users</h2>

            <p>
              View and manage student and property owner accounts.
            </p>

            <button>Manage Users</button>
          </div>

          <div className="dashboard-card">
            <h2>🏠 Manage Properties</h2>

            <p>
              Review and manage accommodation listings.
            </p>

            <button>Manage Properties</button>
          </div>

          <div className="dashboard-card">
            <h2>📊 Platform Statistics</h2>

            <p>
              View activity and growth across STUVANA.
            </p>

            <button>View Statistics</button>
          </div>
        </section>
      </main>
    );
  }

  // PROPERTY OWNER DASHBOARD
  if (accountType === "owner") {
    return (
      <main className="dashboard-page">
        <nav className="dashboard-nav">
          <a href="/" className="logo">
            STUVANA
          </a>

          <button onClick={handleLogout}>Log Out</button>
        </nav>

        <section className="dashboard-header">
          <p className="hero-label">PROPERTY OWNER</p>

          <h1>Property Owner Dashboard</h1>

          <p>Welcome back, {fullName}.</p>
        </section>

        <section className="dashboard-grid">
          <div className="dashboard-card">
            <h2>🏠 My Properties</h2>

            <p>
              Manage your accommodation listings.
            </p>

            <button
              type="button"
              onClick={() => router.push("/owner/dashboard")}
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
              onClick={() => router.push("/owner/add-property")}
            >
              Add Property
            </button>
          </div>

          <div className="dashboard-card">
            <h2>👨‍🎓 Interested Students</h2>

            <p>
              View students interested in your properties.
            </p>

            <button
              type="button"
              onClick={() => alert("Student interest management is coming soon.")}
            >
              View Students
            </button>
          </div>
        </section>
      </main>
    );
  }

  // STUDENT DASHBOARD
  return (
    <main className="dashboard-page">
      <nav className="dashboard-nav">
        <a href="/" className="logo">
          STUVANA
        </a>

        <button onClick={handleLogout}>Log Out</button>
      </nav>

      <section className="dashboard-header">
        <p className="hero-label">STUDENT ACCOUNT</p>

        <h1>Student Dashboard</h1>

        <p>Welcome back, {fullName}.</p>
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
            onClick={() => router.push("/saved")}
          >
            View Saved
          </button>
        </div>

        <div className="dashboard-card">
          <h2>👤 My Profile</h2>

          <p>
            View and manage your account information.
          </p>

          <button
            type="button"
            onClick={() => router.push("/profile")}
          >
            View Profile
          </button>
        </div>
      </section>
    </main>
  );
}