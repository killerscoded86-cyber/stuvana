"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type PropertyMedia = {
  id: number;
  property_id: number;
  media_type: "image" | "video";
  storage_path: string;
  public_url: string;
  sort_order: number;
};

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [savedProperties, setSavedProperties] =
    useState<number[]>([]);
  const [propertyMedia, setPropertyMedia] = useState<
    Record<number, PropertyMedia[]>
  >({});
  const [loadingProperties, setLoadingProperties] =
    useState(true);

  useEffect(() => {
    async function loadData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUser(user);

      // Load only admin-approved properties
      const {
        data: propertiesData,
        error: propertiesError,
      } = await supabase
        .from("properties")
        .select("*")
        .eq("status", "approved")
        .order("created_at", {
          ascending: false,
        });

      if (propertiesError) {
        console.error(
          "Properties error:",
          propertiesError
        );
      } else {
        const loadedProperties =
          propertiesData || [];

        setProperties(loadedProperties);

        // Load photos and videos for approved properties
        if (loadedProperties.length > 0) {
          const propertyIds =
            loadedProperties.map(
              (property) => property.id
            );

          const {
            data: mediaData,
            error: mediaError,
          } = await supabase
            .from("property_media")
            .select("*")
            .in(
              "property_id",
              propertyIds
            )
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
      }

      // Load saved properties for logged-in user
      if (user) {
        const {
          data: savedData,
          error: savedError,
        } = await supabase
          .from("saved_properties")
          .select("property_id")
          .eq(
            "user_id",
            user.id
          );

        if (savedError) {
          console.error(
            "Saved properties error:",
            savedError
          );
        } else {
          setSavedProperties(
            (savedData || []).map(
              (item) =>
                item.property_id
            )
          );
        }
      }

      setLoadingProperties(false);
    }

    loadData();

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {
          setUser(
            session?.user ?? null
          );
        }
      );

    return () =>
      subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();

    setUser(null);
    setSavedProperties([]);
  }

  async function toggleSave(
    propertyId: number
  ) {
    if (!user) {
      alert(
        "Please log in to save properties."
      );

      return;
    }

    const isSaved =
      savedProperties.includes(
        propertyId
      );

    if (isSaved) {
      const { error } =
        await supabase
          .from(
            "saved_properties"
          )
          .delete()
          .eq(
            "user_id",
            user.id
          )
          .eq(
            "property_id",
            propertyId
          );

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

      setSavedProperties(
        (current) =>
          current.filter(
            (id) =>
              id !== propertyId
          )
      );
    } else {
      const { error } =
        await supabase
          .from(
            "saved_properties"
          )
          .insert({
            user_id: user.id,
            property_id:
              propertyId,
          });

      if (error) {
        console.error(
          "Save property error:",
          error
        );

        alert(
          "Could not save property."
        );

        return;
      }

      setSavedProperties(
        (current) => [
          ...current,
          propertyId,
        ]
      );
    }
  }

  return (
    <main>
      <nav>
        <h1>STUVANA</h1>

        <div>
          <a href="#home">
            Home
          </a>

          <a href="#housing">
            Find Housing
          </a>

          <a href="#about">
            About
          </a>

          {user ? (
            <>
              <a href="/dashboard">
                <button>
                  My Account
                </button>
              </a>

              <button
                onClick={
                  handleLogout
                }
              >
                Log Out
              </button>
            </>
          ) : (
            <>
              <a href="/login">
                <button>
                  Log In
                </button>
              </a>

              <a href="/signup">
                <button>
                  Sign Up
                </button>
              </a>
            </>
          )}
        </div>
      </nav>

      <section id="home">
        <p className="hero-label">
          STUDENT ACCOMMODATION MADE SIMPLE
        </p>

        <h2>
          Find Your Perfect Student Home
        </h2>

        <p>
          Find verified hostels, rooms, and
          student accommodation near your
          university.
        </p>

        <div className="search-box">
          <select defaultValue="">
            <option
              value=""
              disabled
            >
              Select University
            </option>

            <option>
              UPSA
            </option>

            <option>
              University of Ghana
            </option>

            <option>
              KNUST
            </option>

            <option>
              University of Cape Coast
            </option>
          </select>

          <select defaultValue="">
            <option
              value=""
              disabled
            >
              Room Type
            </option>

            <option>
              Single Room
            </option>

            <option>
              2 in a Room
            </option>

            <option>
              4 in a Room
            </option>

            <option>
              6 in a Room
            </option>
          </select>

          <button>
            Search Housing
          </button>
        </div>
      </section>

      <section id="housing">
        <div className="section-heading">
          <p>
            FEATURED ACCOMMODATION
          </p>

          <h2>
            Find Student Accommodation
          </h2>

          <span>
            Explore accommodation options
            near your university and find a
            room that fits your budget.
          </span>
        </div>

        {loadingProperties ? (
          <p>
            Loading accommodation...
          </p>
        ) : properties.length ===
          0 ? (
          <p>
            No approved accommodation is
            available yet.
          </p>
        ) : (
          <div className="property-grid">
            {properties.map(
              (property) => {
                const isSaved =
                  savedProperties.includes(
                    property.id
                  );

                const media =
                  propertyMedia[
                    property.id
                  ] || [];

                const propertyImages =
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
                  propertyImages.find(
                    (image) =>
                      image.public_url ===
                      property.image_url
                  ) ||
                  propertyImages[0];

                const spaces =
                  Number(
                    property.spaces
                  );

                const roomUnavailable =
                  Number.isFinite(
                    spaces
                  ) &&
                  spaces <= 0;

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

                      {roomUnavailable && (
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
                          onClick={() =>
                            toggleSave(
                              property.id
                            )
                          }
                          aria-label={
                            isSaved
                              ? "Remove saved property"
                              : "Save property"
                          }
                        >
                          {isSaved
                            ? "♥"
                            : "♡"}
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

                        {roomUnavailable ? (
                          <span
                            style={{
                              color:
                                "#991b1b",
                              fontWeight:
                                700,
                            }}
                          >
                            Room unavailable
                            at the moment
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
                            {Number(
                              property.display_price ??
                                property.price
                            ).toLocaleString()}
                          </strong>

                          <small>
                            {
                              property.period
                            }
                          </small>
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
                    </div>
                  </article>
                );
              }
            )}
          </div>
        )}

        <button className="view-all-button">
          View All Accommodation
        </button>
      </section>

      <section id="about">
        <p className="section-label">
          ABOUT STUVANA
        </p>

        <h2>
          Built for Students
        </h2>

        <p>
          STUVANA makes it easier for
          students to discover verified
          accommodation, compare options,
          and find a comfortable place to
          live. We are starting in Ghana
          and building toward universities
          around the world.
        </p>
      </section>
    </main>
  );
}