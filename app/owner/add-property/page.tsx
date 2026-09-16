"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AddPropertyPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [roomType, setRoomType] = useState("");
  const [price, setPrice] = useState("");
  const [period, setPeriod] = useState("Per Semester");
  const [spaces, setSpaces] = useState("");
  const [university, setUniversity] = useState("");
  const [walkingMinutes, setWalkingMinutes] = useState("");
  const [description, setDescription] = useState("");

  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationAccuracy, setLocationAccuracy] =
    useState<number | null>(null);
  const [gettingLocation, setGettingLocation] =
    useState(false);

  const [photos, setPhotos] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);

  function usePreciseLocation() {
    if (!navigator.geolocation) {
      alert(
        "Your browser does not support location services."
      );
      return;
    }

    setGettingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const currentLatitude =
          position.coords.latitude;

        const currentLongitude =
          position.coords.longitude;

        setLatitude(currentLatitude);
        setLongitude(currentLongitude);
        setLocationAccuracy(
          position.coords.accuracy
        );

        setGettingLocation(false);
      },
      (error) => {
        console.error(
          "Location error:",
          error
        );

        setGettingLocation(false);

        if (error.code === 1) {
          alert(
            "Location permission was denied. Please allow location access in your browser and try again."
          );
        } else if (error.code === 2) {
          alert(
            "Your location could not be determined. Please try again."
          );
        } else {
          alert(
            "Unable to get your precise location. Please try again."
          );
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name || !location || !roomType || !price || !spaces) {
      alert("Please fill in all required fields.");
      return;
    }

    if (
      latitude === null ||
      longitude === null
    ) {
      alert(
        "Please select the property's precise location on the map before submitting."
      );
      return;
    }

    const basePrice = Number(price);

    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      alert("Please enter a valid property price.");
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("Please log in first.");
        router.push("/login");
        return;
      }

      // Check account type
      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("account_type")
          .eq("id", user.id)
          .single();

      if (profileError || profile?.account_type !== "owner") {
        alert("Only property owners can add properties.");
        return;
      }

      // =====================================================
      // CALCULATE FINAL STUDENT DISPLAY PRICE
      // =====================================================

      const paystackFeeRate = 0.0195;

      const basePricePesewas =
        Math.round(basePrice * 100);

      const displayPricePesewas = Math.ceil(
        basePricePesewas /
          (1 - paystackFeeRate)
      );

      const displayPrice =
        displayPricePesewas / 100;

      // =====================================================
      // 1. CREATE PROPERTY
      // =====================================================

      const {
        data: property,
        error: propertyError,
      } = await supabase
        .from("properties")
        .insert({
          name,
          location,
          room_type: roomType,
          price: basePrice,
          display_price: displayPrice,
          period,
          spaces: Number(spaces),
          university: university || null,
          description: description || null,
          walking_minutes: walkingMinutes
            ? Number(walkingMinutes)
            : null,
          owner_id: user.id,
          image_url: null,

          // New properties must wait for admin approval.
          status: "pending",

          // Precise property location.
          latitude,
          longitude,
        })
        .select()
        .single();

      if (propertyError) {
        throw propertyError;
      }

      const propertyId = property.id;

      const mediaRows: {
        property_id: number;
        media_type: "image" | "video";
        storage_path: string;
        public_url: string;
        sort_order: number;
      }[] = [];

      // =====================================================
      // 2. UPLOAD PHOTOS
      // =====================================================

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];

        const fileExt =
          photo.name
            .split(".")
            .pop()
            ?.toLowerCase() || "jpg";

        const fileName = `${user.id}/${propertyId}/images/${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } =
          await supabase.storage
            .from("property-media")
            .upload(
              fileName,
              photo
            );

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicData } =
          supabase.storage
            .from("property-media")
            .getPublicUrl(fileName);

        mediaRows.push({
          property_id: propertyId,
          media_type: "image",
          storage_path: fileName,
          public_url:
            publicData.publicUrl,
          sort_order: i,
        });
      }

      // =====================================================
      // 3. UPLOAD VIDEO
      // =====================================================

      if (video) {
        const fileExt =
          video.name
            .split(".")
            .pop()
            ?.toLowerCase() || "mp4";

        const fileName = `${user.id}/${propertyId}/videos/${crypto.randomUUID()}.${fileExt}`;

        const { error: videoError } =
          await supabase.storage
            .from("property-media")
            .upload(
              fileName,
              video
            );

        if (videoError) {
          throw videoError;
        }

        const { data: publicData } =
          supabase.storage
            .from("property-media")
            .getPublicUrl(fileName);

        mediaRows.push({
          property_id: propertyId,
          media_type: "video",
          storage_path: fileName,
          public_url:
            publicData.publicUrl,
          sort_order: photos.length,
        });
      }

      // =====================================================
      // 4. SAVE ALL MEDIA RECORDS
      // =====================================================

      if (mediaRows.length > 0) {
        const { error: mediaError } =
          await supabase
            .from("property_media")
            .insert(mediaRows);

        if (mediaError) {
          throw mediaError;
        }
      }

      // =====================================================
      // 5. FIRST UPLOADED PHOTO = COVER PHOTO
      // =====================================================

      if (
        photos.length > 0 &&
        mediaRows.length > 0
      ) {
        const firstUploadedPhoto =
          mediaRows.find(
            (media) =>
              media.media_type ===
              "image"
          );

        if (firstUploadedPhoto) {
          const {
            error: imageUpdateError,
          } = await supabase
            .from("properties")
            .update({
              image_url:
                firstUploadedPhoto.public_url,
            })
            .eq("id", propertyId)
            .eq("owner_id", user.id);

          if (imageUpdateError) {
            throw imageUpdateError;
          }
        }
      }

      // =====================================================
      // 6. PROPERTY SUBMITTED FOR ADMIN APPROVAL
      // =====================================================

      alert(
        "Property submitted successfully! Your listing is now pending admin approval."
      );

      router.push("/owner/dashboard");
    } catch (error: any) {
      console.error(
        "Add property error:",
        error
      );

      alert(
        error?.message ||
          "Something went wrong while adding the property."
      );
    } finally {
      setLoading(false);
    }
  }

  const mapEmbedUrl =
    latitude !== null &&
    longitude !== null
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.005}%2C${latitude - 0.005}%2C${longitude + 0.005}%2C${latitude + 0.005}&layer=mapnik&marker=${latitude}%2C${longitude}`
      : null;

  return (
    <main className="dashboard-page">
      <nav className="dashboard-nav">
        <a
          href="/"
          className="logo"
        >
          STUVANA
        </a>

        <button
          onClick={() =>
            router.push("/dashboard")
          }
        >
          ← Dashboard
        </button>
      </nav>

      <section className="dashboard-header">
        <p className="hero-label">
          PROPERTY OWNER
        </p>

        <h1>Add Property</h1>

        <p>
          Submit your student accommodation
          for admin review.
        </p>
      </section>

      <section className="add-property-container">
        <form
          className="add-property-form"
          onSubmit={handleSubmit}
        >
          <div className="form-section">
            <h2>Property Information</h2>

            <label>
              Property Name *
              <input
                type="text"
                value={name}
                onChange={(e) =>
                  setName(e.target.value)
                }
                placeholder="e.g. Madina Student Hostel"
                required
              />
            </label>

            <label>
              Location *
              <input
                type="text"
                value={location}
                onChange={(e) =>
                  setLocation(e.target.value)
                }
                placeholder="e.g. Madina, Accra"
                required
              />
            </label>

            <label>
              University
              <input
                type="text"
                value={university}
                onChange={(e) =>
                  setUniversity(
                    e.target.value
                  )
                }
                placeholder="e.g. UPSA"
              />
            </label>

            <label>
              Walking Time to Campus
              <div className="input-with-suffix">
                <input
                  type="number"
                  min="1"
                  value={walkingMinutes}
                  onChange={(e) =>
                    setWalkingMinutes(
                      e.target.value
                    )
                  }
                  placeholder="15"
                />

                <span>
                  mins walk
                </span>
              </div>
            </label>
          </div>

          <div className="form-section">
            <h2>
              Precise Property Location
            </h2>

            <p className="upload-help">
              Use your device's precise location
              to mark the exact position of the
              property on the map.
            </p>

            <button
              type="button"
              onClick={usePreciseLocation}
              disabled={gettingLocation}
              className="details-secondary-button"
              style={{
                marginBottom:
                  "16px",
                cursor: gettingLocation
                  ? "not-allowed"
                  : "pointer",
              }}
            >
              {gettingLocation
                ? "Getting Precise Location..."
                : "📍 Use My Precise Location"}
            </button>

            {latitude !== null &&
              longitude !== null && (
                <div
                  style={{
                    marginBottom:
                      "16px",
                    padding:
                      "14px",
                    borderRadius:
                      "10px",
                    background:
                      "#f0fdf4",
                    border:
                      "1px solid #bbf7d0",
                  }}
                >
                  <strong>
                    Property location selected
                  </strong>

                  <p
                    style={{
                      margin:
                        "6px 0 0",
                      fontSize:
                        "14px",
                    }}
                  >
                    Latitude:{" "}
                    {latitude.toFixed(
                      6
                    )}
                    <br />
                    Longitude:{" "}
                    {longitude.toFixed(
                      6
                    )}
                  </p>

                  {locationAccuracy !==
                    null && (
                    <p
                      style={{
                        margin:
                          "6px 0 0",
                        fontSize:
                          "13px",
                      }}
                    >
                      GPS accuracy:
                      {" "}
                      approximately{" "}
                      {Math.round(
                        locationAccuracy
                      )}
                      m
                    </p>
                  )}
                </div>
              )}

            {mapEmbedUrl ? (
              <div
                style={{
                  width: "100%",
                  overflow:
                    "hidden",
                  borderRadius:
                    "12px",
                  border:
                    "1px solid #e5e7eb",
                }}
              >
                <iframe
                  title="Property location map"
                  src={mapEmbedUrl}
                  style={{
                    width: "100%",
                    height: "350px",
                    border: 0,
                  }}
                  loading="lazy"
                />
              </div>
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "220px",
                  borderRadius:
                    "12px",
                  background:
                    "#f3f4f6",
                  display: "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  textAlign: "center",
                  padding: "20px",
                  color: "#6b7280",
                }}
              >
                Your precise property
                location will appear
                here after you select it.
              </div>
            )}
          </div>

          <div className="form-section">
            <h2>
              Room & Pricing
            </h2>

            <label>
              Room Type *
              <select
                value={roomType}
                onChange={(e) =>
                  setRoomType(e.target.value)
                }
                required
              >
                <option value="">
                  Select room type
                </option>

                <option value="Single Room">
                  Single Room
                </option>

                <option value="2 in a Room">
                  2 in a Room
                </option>

                <option value="3 in a Room">
                  3 in a Room
                </option>

                <option value="4 in a Room">
                  4 in a Room
                </option>

                <option value="5 in a Room">
                  5 in a Room
                </option>

                <option value="Apartment">
                  Apartment
                </option>
              </select>
            </label>

            <label>
              Owner's Price *
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) =>
                  setPrice(e.target.value)
                }
                placeholder="8500"
                required
              />
            </label>

            <p className="upload-help">
              STUVANA will automatically
              include payment processing costs
              in the final price shown to
              students.
            </p>

            <label>
              Payment Period
              <select
                value={period}
                onChange={(e) =>
                  setPeriod(e.target.value)
                }
              >
                <option value="Per Semester">
                  Per Semester
                </option>

                <option value="Per Academic Year">
                  Per Academic Year
                </option>

                <option value="Per Month">
                  Per Month
                </option>
              </select>
            </label>

            <label>
              Available Spaces *
              <input
                type="number"
                min="1"
                value={spaces}
                onChange={(e) =>
                  setSpaces(e.target.value)
                }
                placeholder="5"
                required
              />
            </label>
          </div>

          <div className="form-section">
            <h2>Description</h2>

            <label>
              Property Description

              <textarea
                value={description}
                onChange={(e) =>
                  setDescription(
                    e.target.value
                  )
                }
                placeholder="Tell students about the accommodation..."
                rows={6}
              />
            </label>
          </div>

          <div className="form-section">
            <h2>Photos</h2>

            <p className="upload-help">
              Upload photos of the rooms,
              exterior, kitchen, bathroom,
              surroundings, etc. The first
              photo you select will be used as
              the property's cover photo.
            </p>

            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                setPhotos(
                  Array.from(
                    e.target.files || []
                  )
                );
              }}
            />

            {photos.length > 0 && (
              <p className="selected-files">
                {photos.length} photo
                {photos.length > 1
                  ? "s"
                  : ""}{" "}
                selected. The first
                selected photo will be the
                cover photo.
              </p>
            )}
          </div>

          <div className="form-section">
            <h2>
              Property Video
            </h2>

            <p className="upload-help">
              Optional. Upload a video tour
              of the property.
            </p>

            <input
              type="file"
              accept="video/*"
              onChange={(e) => {
                setVideo(
                  e.target.files?.[0] ||
                    null
                );
              }}
            />

            {video && (
              <p className="selected-files">
                Video selected:{" "}
                {video.name}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="add-property-submit"
            disabled={loading}
          >
            {loading
              ? "Submitting Property..."
              : "Submit for Approval"}
          </button>
        </form>
      </section>
    </main>
  );
}