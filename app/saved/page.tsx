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

export default function SavedPropertiesPage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [propertyMedia, setPropertyMedia] = useState<
    Record<number, PropertyMedia[]>
  >({});
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

      const { data: savedData, error: savedError } =
        await supabase
          .from("saved_properties")
          .select("property_id")
          .eq("user_id", user.id);

      if (savedError) {
        console.error(
          "Saved properties error:",
          savedError
        );

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

      // Load only approved properties
      const {
        data: propertiesData,
        error: propertiesError,
      } = await supabase
        .from("properties")
        .select("*")
        .in("id", propertyIds)
        .eq("status", "approved");

      if (propertiesError) {
        console.error(
          "Properties error:",
          propertiesError
        );

        setLoading(false);
        return;
      }

      const loadedProperties =
        propertiesData || [];

      setProperties(loadedProperties);

      // Load photos and videos
      if (loadedProperties.length > 0) {
        const ids = loadedProperties.map(
          (property) => property.id
        );

        const {
          data: mediaData,
          error: mediaError,
        } = await supabase
          .from("property_media")
          .select("*")
          .in("property_id", ids)
          .order("sort_order", {
            ascending: true,
          });

        if (mediaError) {
          console.error(
            "Property media error:",
            mediaError
          );
        } else {
          const groupedMedia: Record<
            number,
            PropertyMedia[]
          > = {};

          (mediaData || []).forEach(
            (item) => {
              if (
                !groupedMedia[
                  item.property_id
                ]
              ) {
                groupedMedia[
                  item.property_id
                ] = [];
              }

              groupedMedia[
                item.property_id
              ].push(item);
            }
          );

          setPropertyMedia(
            groupedMedia
          );
        }
      }

      setLoading(false);
    }

    loadSavedProperties();
  }, [router]);

  async function removeSaved(
    propertyId: number
  ) {
    if (!user) return;

    const { error } = await supabase
      .from("saved_properties")
      .delete()
      .eq("user_id", user.id)
      .eq("property_id", propertyId);

    if (error) {
      console.error(
        "Remove saved property error:",
        error
      );

      alert(
        "Could not remove property."
      );

      return;
    }

    setProperties((current) =>
      current.filter(
        (property) =>
          property.id !== propertyId
      )
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
          <p className="hero-label">
            MY ACCOMMODATION
          </p>

          <h1>
            Loading saved properties...
          </h1>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <nav className="dashboard-nav">
        <a
          href="/"
          className="logo"
        >
          STUVANA
        </a>

        <div
          className="dashboard-nav-actions"
        >
          <button
            type="button"
            onClick={() =>
              router.push("/dashboard")
            }
          >
            Dashboard
          </button>

          <button
            type="button"
            onClick={() =>
              router.push("/")
            }
          >
            Find Housing
          </button>
        </div>
      </nav>

      <section className="dashboard-header">
        <p className="hero-label">
          MY ACCOMMODATION
        </p>

        <h1>
          Saved Properties
        </h1>

        <p>
          View the accommodation
          properties you have saved.
        </p>
      </section>

      <section className="saved-properties-container">
        {properties.length === 0 ? (
          <div className="empty-saved">
            <h2>
              No Saved Properties
            </h2>

            <p>
              You haven't saved any
              accommodation yet.
            </p>

            <button
              type="button"
              onClick={() =>
                router.push("/#housing")
              }
            >
              Find Accommodation
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                marginBottom: "20px",
              }}
            >
              <h2>
                {properties.length}{" "}
                {properties.length === 1
                  ? "Saved Property"
                  : "Saved Properties"}
              </h2>
            </div>

            <div className="property-grid">
              {properties.map(
                (property) => {
                  const media =
                    propertyMedia[
                      property.id
                    ] || [];

                  const images =
                    media.filter(
                      (item) =>
                        item.media_type ===
                        "image"
                    );

                  const hasVideo =
                    media.some(
                      (item) =>
                        item.media_type ===
                        "video"
                    );

                  const mainImage =
                    images.find(
                      (image) =>
                        image.public_url ===
                        property.image_url
                    ) ||
                    images[0];

                  const spaces =
                    Number(
                      property.spaces
                    );

                  const unavailable =
                    Number.isFinite(
                      spaces
                    ) &&
                    spaces <= 0;

                  const price = Number(
                    property.display_price ??
                      property.price
                  );

                  return (
                    <article
                      className="property-card"
                      key={
                        property.id
                      }
                    >
                      <div
                        className="property-image"
                        style={{
                          position:
                            "relative",
                        }}
                      >
                        {mainImage ? (
                          <img
                            src={
                              mainImage.public_url
                            }
                            alt={
                              property.name
                            }
                          />
                        ) : property.image_url ? (
                          <img
                            src={
                              property.image_url
                            }
                            alt={
                              property.name
                            }
                          />
                        ) : (
                          <>
                            <span>
                              🏠
                            </span>

                            <p>
                              Student
                              Accommodation
                            </p>
                          </>
                        )}

                        {hasVideo && (
                          <span className="property-video-badge">
                            🎥 Video Tour
                          </span>
                        )}

                        {unavailable && (
                          <div
                            style={{
                              position:
                                "absolute",
                              inset: 0,
                              display:
                                "flex",
                              alignItems:
                                "center",
                              justifyContent:
                                "center",
                              background:
                                "rgba(0,0,0,0.55)",
                              zIndex: 3,
                            }}
                          >
                            <span
                              style={{
                                padding:
                                  "10px 16px",
                                borderRadius:
                                  "999px",
                                background:
                                  "#ffffff",
                                color:
                                  "#991b1b",
                                fontSize:
                                  "14px",
                                fontWeight:
                                  700,
                              }}
                            >
                              Room unavailable
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="property-content">
                        <div className="property-top">
                          <h3>
                            {
                              property.name
                            }
                          </h3>

                          <button
                            className="save-button"
                            type="button"
                            onClick={() =>
                              removeSaved(
                                property.id
                              )
                            }
                            aria-label="Remove saved property"
                          >
                            ♥
                          </button>
                        </div>

                        <p className="location">
                          📍{" "}
                          {
                            property.location
                          }
                        </p>

                        <div className="property-info">
                          <span>
                            {
                              property.room_type
                            }
                          </span>

                          {unavailable ? (
                            <span
                              style={{
                                color:
                                  "#991b1b",
                                fontWeight:
                                  700,
                              }}
                            >
                              Room unavailable
                            </span>
                          ) : (
                            <span>
                              {spaces}{" "}
                              {spaces ===
                              1
                                ? "space"
                                : "spaces"}{" "}
                              available
                            </span>
                          )}
                        </div>

                        {property.walking_minutes && (
                          <div className="property-walking-time">
                            🚶{" "}
                            {
                              property.walking_minutes
                            }{" "}
                            min walk to
                            campus
                          </div>
                        )}

                        <div className="property-bottom">
                          <div>
                            <strong>
                              GH₵{" "}
                              {Number.isFinite(
                                price
                              )
                                ? price.toLocaleString()
                                : "0"}
                            </strong>

                            <small>
                              {
                                property.period
                              }
                            </small>
                          </div>

                          <button
                            className="details-button"
                            type="button"
                            onClick={() =>
                              router.push(
                                `/property/${property.id}`
                              )
                            }
                          >
                            View Details
                          </button>
                        </div>

                        <button
                          className="remove-saved-button"
                          type="button"
                          onClick={() =>
                            removeSaved(
                              property.id
                            )
                          }
                        >
                          Remove from Saved
                        </button>
                      </div>
                    </article>
                  );
                }
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}