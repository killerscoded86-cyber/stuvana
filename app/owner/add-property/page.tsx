"use client";

import { useEffect, useState } from "react";
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

  const [photos, setPhotos] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [checkingVerification, setCheckingVerification] =
    useState(true);
  const [verificationStatus, setVerificationStatus] =
    useState("unverified");

  useEffect(() => {
    async function checkOwnerVerification() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from("profiles")
          .select(
            "account_type, verification_status"
          )
          .eq("id", user.id)
          .single();

        if (profileError || !profile) {
          console.error(
            "Owner profile lookup error:",
            profileError
          );

          alert(
            "Your account profile could not be loaded. Please contact STUVANA support."
          );

          router.push("/dashboard");
          return;
        }

        if (profile.account_type !== "owner") {
          alert(
            "Only property owners can add properties."
          );

          router.push("/dashboard");
          return;
        }

        const status = String(
          profile.verification_status ||
            "unverified"
        ).toLowerCase();

        setVerificationStatus(status);
      } catch (error) {
        console.error(
          "Owner verification check error:",
          error
        );

        alert(
          "Could not check your owner account status."
        );

        router.push("/dashboard");
      } finally {
        setCheckingVerification(false);
      }
    }

    checkOwnerVerification();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    /*
     * First verification check.
     * This prevents an unverified owner from submitting
     * through the normal page interface.
     */
    if (verificationStatus !== "verified") {
      alert(
        "You must complete identity verification before publishing a property."
      );
      return;
    }

    if (
      !name ||
      !location ||
      !roomType ||
      !price ||
      !spaces
    ) {
      alert("Please fill in all required fields.");
      return;
    }

    const basePrice = Number(price);

    if (
      !Number.isFinite(basePrice) ||
      basePrice <= 0
    ) {
      alert("Please enter a valid property price.");
      return;
    }

    const availableSpaces = Number(spaces);

    if (
      !Number.isInteger(availableSpaces) ||
      availableSpaces <= 0
    ) {
      alert(
        "Please enter a valid number of available spaces."
      );
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

      /*
       * Final verification check immediately before
       * creating the property.
       */
      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select(
          "account_type, verification_status"
        )
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        alert(
          "Your account profile could not be found."
        );
        return;
      }

      if (profile.account_type !== "owner") {
        alert(
          "Only property owners can add properties."
        );
        return;
      }

      const currentVerificationStatus =
        String(
          profile.verification_status ||
            "unverified"
        ).toLowerCase();

      if (
        currentVerificationStatus !==
        "verified"
      ) {
        setVerificationStatus(
          currentVerificationStatus
        );

        alert(
          "Your identity verification is incomplete. You cannot publish a property yet."
        );

        return;
      }

      /*
       * CALCULATE FINAL STUDENT DISPLAY PRICE
       */

      const paystackFeeRate = 0.0195;

      const basePricePesewas = Math.round(
        basePrice * 100
      );

      const displayPricePesewas = Math.ceil(
        basePricePesewas /
          (1 - paystackFeeRate)
      );

      const displayPrice =
        displayPricePesewas / 100;

      /*
       * Create the property.
       */
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
          spaces: availableSpaces,
          university:
            university || null,
          description:
            description || null,
          walking_minutes: walkingMinutes
            ? Number(walkingMinutes)
            : null,
          owner_id: user.id,
          image_url: null,
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

      /*
       * Upload photos.
       */
      for (
        let i = 0;
        i < photos.length;
        i++
      ) {
        const photo = photos[i];

        const fileExt =
          photo.name
            .split(".")
            .pop()
            ?.toLowerCase() || "jpg";

        const fileName =
          `${user.id}/${propertyId}/images/${crypto.randomUUID()}.${fileExt}`;

        const {
          error: uploadError,
        } = await supabase.storage
          .from("property-media")
          .upload(
            fileName,
            photo
          );

        if (uploadError) {
          throw uploadError;
        }

        const {
          data: publicData,
        } = supabase.storage
          .from("property-media")
          .getPublicUrl(
            fileName
          );

        mediaRows.push({
          property_id: propertyId,
          media_type: "image",
          storage_path: fileName,
          public_url:
            publicData.publicUrl,
          sort_order: i,
        });
      }

      /*
       * Upload video.
       */
      if (video) {
        const fileExt =
          video.name
            .split(".")
            .pop()
            ?.toLowerCase() || "mp4";

        const fileName =
          `${user.id}/${propertyId}/videos/${crypto.randomUUID()}.${fileExt}`;

        const {
          error: videoError,
        } = await supabase.storage
          .from("property-media")
          .upload(
            fileName,
            video
          );

        if (videoError) {
          throw videoError;
        }

        const {
          data: publicData,
        } = supabase.storage
          .from("property-media")
          .getPublicUrl(
            fileName
          );

        mediaRows.push({
          property_id: propertyId,
          media_type: "video",
          storage_path: fileName,
          public_url:
            publicData.publicUrl,
          sort_order:
            photos.length,
        });
      }

      /*
       * Save media records.
       */
      if (mediaRows.length > 0) {
        const {
          error: mediaError,
        } = await supabase
          .from("property_media")
          .insert(
            mediaRows
          );

        if (mediaError) {
          throw mediaError;
        }
      }

      /*
       * Set first photo as main property image.
       */
      if (
        photos.length > 0 &&
        mediaRows.length > 0
      ) {
        const firstImage =
          mediaRows.find(
            (media) =>
              media.media_type ===
              "image"
          );

        if (firstImage) {
          const {
            error:
              imageUpdateError,
          } = await supabase
            .from("properties")
            .update({
              image_url:
                firstImage.public_url,
            })
            .eq(
              "id",
              propertyId
            );

          if (imageUpdateError) {
            throw imageUpdateError;
          }
        }
      }

      alert(
        video
          ? "Property, photos and video uploaded successfully!"
          : "Property and photos uploaded successfully!"
      );

      router.push(
        `/property/${propertyId}`
      );
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

  if (checkingVerification) {
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
              router.push(
                "/dashboard"
              )
            }
          >
            ← Dashboard
          </button>
        </nav>

        <section className="dashboard-header">
          <p className="hero-label">
            PROPERTY OWNER
          </p>

          <h1>
            Checking verification...
          </h1>

          <p>
            Please wait while STUVANA
            checks your owner
            verification status.
          </p>
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

        <button
          onClick={() =>
            router.push(
              "/dashboard"
            )
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
          List your student accommodation
          on STUVANA.
        </p>
      </section>

      {verificationStatus !== "verified" && (
        <section
          style={{
            width: "100%",
            maxWidth: "900px",
            margin: "0 auto 20px",
            padding: "18px",
            borderRadius: "14px",
            background:
              verificationStatus ===
              "pending"
                ? "#fef3c7"
                : "#fff7ed",
            border:
              verificationStatus ===
              "pending"
                ? "1px solid #fcd34d"
                : "1px solid #fed7aa",
            color:
              verificationStatus ===
              "pending"
                ? "#92400e"
                : "#9a3412",
            boxSizing: "border-box",
          }}
        >
          <strong>
            {verificationStatus ===
            "pending"
              ? "Identity verification is being reviewed."
              : verificationStatus ===
                "rejected"
              ? "Identity verification was rejected."
              : "Identity verification is required before publishing."}
          </strong>

          <p
            style={{
              margin:
                "8px 0 14px",
              lineHeight: 1.5,
            }}
          >
            You can complete all the
            property details below now.
            However, you must verify
            your identity before you
            can publish this property.
          </p>

          {verificationStatus !==
            "pending" && (
            <button
              type="button"
              className="details-primary-button"
              onClick={() =>
                router.push(
                  "/owner/verification"
                )
              }
            >
              Verify Identity
            </button>
          )}
        </section>
      )}

      <section className="add-property-container">
        <form
          className="add-property-form"
          onSubmit={handleSubmit}
        >
          <div className="form-section">
            <h2>
              Property Information
            </h2>

            <label>
              Property Name *
              <input
                type="text"
                value={name}
                onChange={(e) =>
                  setName(
                    e.target.value
                  )
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
                  setLocation(
                    e.target.value
                  )
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
                  value={
                    walkingMinutes
                  }
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
              Room & Pricing
            </h2>

            <label>
              Room Type *
              <select
                value={roomType}
                onChange={(e) =>
                  setRoomType(
                    e.target.value
                  )
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

                <option value="4 in a Room">
                  4 in a Room
                </option>

                <option value="6 in a Room">
                  6 in a Room
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
                  setPrice(
                    e.target.value
                  )
                }
                placeholder="8500"
                required
              />
            </label>

            <p className="upload-help">
              STUVANA will automatically
              include payment processing
              costs in the final price
              shown to students.
            </p>

            <label>
              Payment Period
              <select
                value={period}
                onChange={(e) =>
                  setPeriod(
                    e.target.value
                  )
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
                  setSpaces(
                    e.target.value
                  )
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
              exterior, kitchen,
              bathroom, surroundings,
              etc.
            </p>

            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                setPhotos(
                  Array.from(
                    e.target.files ||
                      []
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
                selected
              </p>
            )}
          </div>

          <div className="form-section">
            <h2>
              Property Video
            </h2>

            <p className="upload-help">
              Optional. Upload a video
              tour of the property.
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

          {verificationStatus ===
            "verified" ? (
            <div
              style={{
                marginBottom: "16px",
                padding: "14px 16px",
                borderRadius: "12px",
                background: "#f0fdf4",
                border:
                  "1px solid #bbf7d0",
                color: "#166534",
                fontSize: "14px",
                lineHeight: 1.5,
              }}
            >
              ✓ Your STUVANA owner
              identity is verified. You
              are allowed to submit
              properties for admin review.
            </div>
          ) : (
            <div
              style={{
                marginBottom: "16px",
                padding: "14px 16px",
                borderRadius: "12px",
                background: "#fef2f2",
                border:
                  "1px solid #fecaca",
                color: "#991b1b",
                fontSize: "14px",
                lineHeight: 1.5,
              }}
            >
              🔒 Identity verification
              must be completed before
              this property can be
              published.
            </div>
          )}

          <button
            type="submit"
            className="add-property-submit"
            disabled={
              loading ||
              verificationStatus !==
                "verified"
            }
          >
            {loading
              ? "Uploading Property..."
              : verificationStatus ===
                "verified"
              ? "Publish Property"
              : "Verify Identity to Publish"}
          </button>
        </form>
      </section>
    </main>
  );
}