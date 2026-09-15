"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function SavedPropertiesPage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    async function loadSavedProperties() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUser(user);

      const { data: savedData, error: savedError } = await supabase
        .from("saved_properties")
        .select("property_id")
        .eq("user_id", user.id);

      if (savedError) {
        console.error("Saved properties error:", savedError);
        setLoading(false);
        return;
      }

      const propertyIds = (savedData || []).map(
        (item) => item.property_id
      );

      if (propertyIds.length === 0) {
        setProperties([]);
        setLoading(false);
        return;
      }

      const { data: propertiesData, error: propertiesError } =
        await supabase
          .from("properties")
          .select("*")
          .in("id", propertyIds);

      if (propertiesError) {
        console.error("Properties error:", propertiesError);
      } else {
        setProperties(propertiesData || []);
      }

      setLoading(false);
    }

    loadSavedProperties();
  }, [router]);

  async function removeSaved(propertyId: number) {
    if (!user) return;

    const { error } = await supabase
      .from("saved_properties")
      .delete()
      .eq("user_id", user.id)
      .eq("property_id", propertyId);

    if (error) {
      console.error("Remove saved property error:", error);
      alert("Could not remove property.");
      return;
    }

    setProperties((current) =>
      current.filter((property) => property.id !== propertyId)
    );
  }

  // Prevent hydration mismatch
  if (!mounted) {
    return null;
  }

  if (loading) {
    return (
      <main className="dashboard-page">
        <section className="dashboard-header">
          <p className="hero-label">MY ACCOMMODATION</p>
          <h1>Loading saved properties...</h1>
        </section>
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
        <p className="hero-label">MY ACCOMMODATION</p>

        <h1>Saved Properties</h1>

        <p>
          View the accommodation properties you have saved.
        </p>
      </section>

      <section className="saved-properties-container">
        {properties.length === 0 ? (
          <div className="empty-saved">
            <h2>No Saved Properties</h2>

            <p>
              You haven't saved any accommodation yet.
            </p>

            <button
              onClick={() => router.push("/#housing")}
            >
              Find Accommodation
            </button>
          </div>
        ) : (
          <div className="property-grid">
            {properties.map((property) => (
              <article
                className="property-card"
                key={property.id}
              >
                <div className="property-image">
                  <span>🏠</span>
                  <p>Student Accommodation</p>
                </div>

                <div className="property-content">
                  <div className="property-top">
                    <h3>{property.name}</h3>

                    <button
                      className="save-button"
                      onClick={() =>
                        removeSaved(property.id)
                      }
                    >
                      ♥
                    </button>
                  </div>

                  <p className="location">
                    📍 {property.location}
                  </p>

                  <div className="property-info">
                    <span>{property.room_type}</span>

                    <span>
                      {property.spaces} spaces available
                    </span>
                  </div>

                  <div className="property-bottom">
                    <div>
                      <strong>
                        GH₵{" "}
                        {Number(property.price).toLocaleString()}
                      </strong>

                      <small>{property.period}</small>
                    </div>

                    <button
                      className="details-button"
                      onClick={() => {
                        window.location.href = `/property/${property.id}`;
                      }}
                    >
                      View Details
                    </button>
                  </div>

                  <button
                    className="remove-saved-button"
                    onClick={() =>
                      removeSaved(property.id)
                    }
                  >
                    Remove from Saved
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}