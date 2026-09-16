"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type PropertyMedia = {
  id: number;
  property_id: number;
  media_type: "image" | "video";
  storage_path: string;
  public_url: string;
  sort_order: number;
};

export default function PropertyDetailsPage() {
  const params = useParams();
  const router = useRouter();

  const [property, setProperty] = useState<any>(null);
  const [media, setMedia] = useState<PropertyMedia[]>([]);
  const [selectedMedia, setSelectedMedia] =
    useState<PropertyMedia | null>(null);

  const [user, setUser] = useState<any>(null);
  const [accountType, setAccountType] = useState<string | null>(null);

  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const propertyId = Number(params?.id);

  useEffect(() => {
    async function loadProperty() {
      if (!propertyId || Number.isNaN(propertyId)) {
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUser(user);

      /* LOAD USER ACCOUNT TYPE */
      if (user) {
        const { data: profile, error: profileError } =
          await supabase
            .from("profiles")
            .select("account_type")
            .eq("id", user.id)
            .maybeSingle();

        if (profileError) {
          console.error("Profile error:", profileError);
        } else {
          setAccountType(profile?.account_type || null);
        }
      } else {
        setAccountType(null);
      }

      /* LOAD ONLY APPROVED PROPERTY */

      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("id", propertyId)
        .eq("status", "approved")
        .single();

      if (error || !data) {
        console.error("Property error:", error);

        setProperty(null);
        setLoading(false);
        return;
      }

      setProperty(data);

      /* LOAD PROPERTY MEDIA */

      const {
        data: mediaData,
        error: mediaError,
      } = await supabase
        .from("property_media")
        .select("*")
        .eq("property_id", propertyId)
        .order("sort_order", {
          ascending: true,
        });

      if (mediaError) {
        console.error("Property media error:", mediaError);
      }

      const loadedMedia = mediaData || [];

      setMedia(loadedMedia);

      const mainImage = loadedMedia.find(
        (item) =>
          item.media_type === "image" &&
          item.public_url === data.image_url
      );

      if (mainImage) {
        setSelectedMedia(mainImage);
      } else {
        const firstImage = loadedMedia.find(
          (item) => item.media_type === "image"
        );

        if (firstImage) {
          setSelectedMedia(firstImage);
        }
      }

      /* LOAD SAVED PROPERTY */

      if (user) {
        const {
          data: savedData,
          error: savedError,
        } = await supabase
          .from("saved_properties")
          .select("id")
          .eq("user_id", user.id)
          .eq("property_id", propertyId)
          .maybeSingle();

        if (savedError) {
          console.error(
            "Saved property error:",
            savedError
          );
        }

        setSaved(!!savedData);
      }

      setLoading(false);
    }

    loadProperty();
  }, [propertyId]);

  async function toggleSave() {
    if (!user) {
      alert("Please log in to save properties.");

      router.push("/login");
      return;
    }

    const isSaved = saved;

    if (isSaved) {
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

        alert("Could not remove property.");
        return;
      }

      setSaved(false);
    } else {
      const { error } = await supabase
        .from("saved_properties")
        .insert({
          user_id: user.id,
          property_id: propertyId,
        });

      if (error) {
        console.error(
          "Save property error:",
          error
        );

        alert("Could not save property.");
        return;
      }

      setSaved(true);
    }
  }

  async function handlePayment() {
    /* MUST BE SIGNED IN */

    if (!user) {
      alert(
        "Please log in as a student before making a payment."
      );

      router.push("/login");
      return;
    }

    /* MUST BE A STUDENT */

    if (accountType !== "student") {
      alert(
        "Only student accounts can book accommodation."
      );

      return;
    }

    if (!property) return;

    setPaying(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        alert(
          "Your login session has expired. Please log in again."
        );

        router.push("/login");
        return;
      }

      const response = await fetch(
        "/api/payments/initialize",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            propertyId: property.id,
            email: user.email,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error(
          "Payment initialization error:",
          data
        );

        alert(
          data.error ||
            "Could not start payment."
        );

        setPaying(false);
        return;
      }

      if (!data.authorization_url) {
        alert(
          "Paystack payment link was not created."
        );

        setPaying(false);
        return;
      }

      window.location.href =
        data.authorization_url;
    } catch (error) {
      console.error(
        "Payment error:",
        error
      );

      alert(
        "Something went wrong while starting payment."
      );

      setPaying(false);
    }
  }

  if (loading) {
    return (
      <main className="dashboard-page">
        <section className="dashboard-header">
          <p className="hero-label">
            STUVANA
          </p>

          <h1>
            Loading property...
          </h1>
        </section>
      </main>
    );
  }

  if (!property) {
    return (
      <main className="dashboard-page">
        <section className="dashboard-header">
          <p className="hero-label">
            PROPERTY NOT AVAILABLE
          </p>

          <h1>
            This accommodation is not currently available.
          </h1>

          <p
            style={{
              marginTop: "10px",
              color: "#666",
            }}
          >
            The property may still be waiting for approval,
            may have been rejected, or may no longer be listed.
          </p>

          <button
            onClick={() =>
              router.push("/#housing")
            }
            style={{
              marginTop: "20px",
            }}
          >
            Back to Accommodation
          </button>
        </section>
      </main>
    );
  }

  const imageMedia = media.filter(
    (item) =>
      item.media_type === "image"
  );

  const videoMedia = media.find(
    (item) =>
      item.media_type === "video"
  );

  const isStudent =
    !!user &&
    accountType === "student";

  const hasPropertyCoordinates =
    typeof property.latitude === "number" &&
    typeof property.longitude === "number";

  const propertyMapUrl =
    hasPropertyCoordinates
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${property.longitude - 0.005}%2C${property.latitude - 0.005}%2C${property.longitude + 0.005}%2C${property.latitude + 0.005}&layer=mapnik&marker=${property.latitude}%2C${property.longitude}`
      : null;

  return (
    <main className="property-details-page">
      <nav className="dashboard-nav">
        <a
          href="/"
          className="logo"
        >
          STUVANA
        </a>

        <button
          onClick={() =>
            router.push("/#housing")
          }
        >
          ← Back to Housing
        </button>
      </nav>

      <section className="property-details-container">

        {/* PROPERTY MEDIA */}

        <div className="property-details-media">
          {selectedMedia ? (
            selectedMedia.media_type ===
            "video" ? (
              <video
                key={selectedMedia.id}
                src={
                  selectedMedia.public_url
                }
                controls
                playsInline
                className="public-property-video"
              />
            ) : (
              <img
                src={
                  selectedMedia.public_url
                }
                alt={property.name}
              />
            )
          ) : property.image_url ? (
            <img
              src={property.image_url}
              alt={property.name}
            />
          ) : (
            <div className="property-placeholder">
              <span>🏠</span>
              <p>
                Student Accommodation
              </p>
            </div>
          )}
        </div>

        {/* MEDIA THUMBNAILS */}

        {media.length > 0 && (
          <div className="public-property-media-gallery">

            {imageMedia.map((item) => (
              <button
                type="button"
                key={item.id}
                className={
                  selectedMedia?.id ===
                  item.id
                    ? "public-media-thumbnail active"
                    : "public-media-thumbnail"
                }
                onClick={() =>
                  setSelectedMedia(item)
                }
              >
                <img
                  src={item.public_url}
                  alt={property.name}
                />
              </button>
            ))}

            {videoMedia && (
              <button
                type="button"
                className={
                  selectedMedia?.id ===
                  videoMedia.id
                    ? "public-media-thumbnail video-thumbnail active"
                    : "public-media-thumbnail video-thumbnail"
                }
                onClick={() =>
                  setSelectedMedia(
                    videoMedia
                  )
                }
              >
                <div className="video-thumbnail-content">
                  <span className="video-play-icon">
                    ▶
                  </span>

                  <span>
                    Video Tour
                  </span>
                </div>
              </button>
            )}

          </div>
        )}

        {/* PROPERTY INFORMATION */}

        <div className="property-details-content">

          <div className="property-details-top">
            <div>
              <p className="hero-label">
                STUDENT ACCOMMODATION
              </p>

              <h1>
                {property.name}
              </h1>

              <p className="property-location">
                📍{" "}
                {property.location}
              </p>
            </div>

            <button
              className="save-button"
              onClick={toggleSave}
              aria-label={
                saved
                  ? "Remove saved property"
                  : "Save property"
              }
            >
              {saved ? "♥" : "♡"}
            </button>
          </div>

          <div className="property-details-price">
            <strong>
              GH₵{" "}
              {Number(
                property.display_price ??
                  property.price
              ).toLocaleString()}
            </strong>

            <span>
              {property.period}
            </span>
          </div>

          <div className="property-details-info">

            <div>
              <span>
                🏠 Room Type
              </span>

              <strong>
                {property.room_type}
              </strong>
            </div>

            <div>
              <span>
                👥 Availability
              </span>

              <strong>
                {property.spaces} spaces
              </strong>
            </div>

            <div>
              <span>
                🎓 University
              </span>

              <strong>
                {property.university ||
                  "Not specified"}
              </strong>
            </div>

          </div>

          <div className="property-description">
            <h2>
              About this accommodation
            </h2>

            <p>
              {property.description ||
                "No description has been provided for this property yet."}
            </p>
          </div>

          {/* PROPERTY LOCATION */}

          {propertyMapUrl && (
            <div
              className="property-location-map"
              style={{
                marginTop: "30px",
              }}
            >
              <div
                style={{
                  marginBottom: "16px",
                }}
              >
                <p className="hero-label">
                  PROPERTY LOCATION
                </p>

                <h2>
                  Find this accommodation
                </h2>

                <p
                  style={{
                    color: "#666",
                    marginTop: "6px",
                  }}
                >
                  The map shows the precise
                  location provided by the
                  property owner.
                </p>
              </div>

              <div
                style={{
                  width: "100%",
                  overflow: "hidden",
                  borderRadius: "16px",
                  border:
                    "1px solid rgba(0,0,0,0.08)",
                  background: "#f3f4f6",
                }}
              >
                <iframe
                  title={`${property.name} location`}
                  src={propertyMapUrl}
                  style={{
                    width: "100%",
                    height: "400px",
                    border: 0,
                    display: "block",
                  }}
                  loading="lazy"
                />
              </div>

              <div
                style={{
                  marginTop: "10px",
                  fontSize: "13px",
                  color: "#777",
                }}
              >
                📍 {property.latitude.toFixed(6)},{" "}
                {property.longitude.toFixed(6)}
              </div>
            </div>
          )}

          {/* PROPERTY VIDEO */}

          {videoMedia && (
            <div className="public-video-section">

              <div className="public-video-heading">
                <div>
                  <p className="hero-label">
                    PROPERTY TOUR
                  </p>

                  <h2>
                    Watch the property video
                  </h2>
                </div>
              </div>

              <video
                src={
                  videoMedia.public_url
                }
                controls
                playsInline
                preload="metadata"
                className="public-property-video-large"
              />

            </div>
          )}

          {/* PAYMENT */}

          {isStudent ? (
            <div
              style={{
                marginTop: "30px",
                padding: "24px",
                borderRadius: "16px",
                border:
                  "1px solid rgba(0,0,0,0.08)",
                background: "#fafafa",
              }}
            >
              <h2
                style={{
                  marginBottom: "8px",
                }}
              >
                Book this accommodation
              </h2>

              <p
                style={{
                  marginBottom: "18px",
                  color: "#666",
                }}
              >
                Secure your accommodation
                by paying through Paystack.
              </p>

              <button
                className="details-primary-button"
                onClick={handlePayment}
                disabled={paying}
                style={{
                  width: "100%",
                  cursor: paying
                    ? "not-allowed"
                    : "pointer",
                  opacity: paying
                    ? 0.7
                    : 1,
                }}
              >
                {paying
                  ? "Opening Paystack..."
                  : `Pay GH₵ ${Number(
                      property.display_price ??
                        property.price
                    ).toLocaleString()}`}
              </button>

              <p
                style={{
                  marginTop: "12px",
                  fontSize: "13px",
                  color: "#777",
                  textAlign: "center",
                }}
              >
                Secure payment powered
                by Paystack
              </p>
            </div>
          ) : (
            <div
              style={{
                marginTop: "30px",
                padding: "20px 24px",
                borderRadius: "16px",
                border:
                  "1px solid rgba(0,0,0,0.08)",
                background: "#fafafa",
              }}
            >
              <h2
                style={{
                  marginBottom: "8px",
                }}
              >
                Want to book this accommodation?
              </h2>

              <p
                style={{
                  margin: 0,
                  color: "#666",
                }}
              >
                Please sign in with a student
                account to book and pay for
                accommodation.
              </p>
            </div>
          )}

          {/* ACTIONS */}

          <div className="property-actions">

            <button
              className="details-secondary-button"
              onClick={toggleSave}
            >
              {saved
                ? "♥ Saved Property"
                : "♡ Save Property"}
            </button>

            <button
              className="details-secondary-button"
              onClick={() =>
                router.push("/#housing")
              }
            >
              Find More Housing
            </button>

          </div>

        </div>
      </section>
    </main>
  );
}