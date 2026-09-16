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

  const [photos, setPhotos] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name || !location || !roomType || !price || !spaces) {
      alert("Please fill in all required fields.");
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

      const basePricePesewas = Math.round(basePrice * 100);

      const displayPricePesewas = Math.ceil(
        basePricePesewas / (1 - paystackFeeRate)
      );

      const displayPrice = displayPricePesewas / 100;

      // =====================================================
      // 1. CREATE PROPERTY
      // =====================================================

      const { data: property, error: propertyError } =
        await supabase
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
          photo.name.split(".").pop()?.toLowerCase() || "jpg";

        const fileName = `${user.id}/${propertyId}/images/${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("property-media")
          .upload(fileName, photo);

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicData } = supabase.storage
          .from("property-media")
          .getPublicUrl(fileName);

        mediaRows.push({
          property_id: propertyId,
          media_type: "image",
          storage_path: fileName,
          public_url: publicData.publicUrl,
          sort_order: i,
        });
      }

      // =====================================================
      // 3. UPLOAD VIDEO
      // =====================================================

      if (video) {
        const fileExt =
          video.name.split(".").pop()?.toLowerCase() || "mp4";

        const fileName = `${user.id}/${propertyId}/videos/${crypto.randomUUID()}.${fileExt}`;

        const { error: videoError } = await supabase.storage
          .from("property-media")
          .upload(fileName, video);

        if (videoError) {
          throw videoError;
        }

        const { data: publicData } = supabase.storage
          .from("property-media")
          .getPublicUrl(fileName);

        mediaRows.push({
          property_id: propertyId,
          media_type: "video",
          storage_path: fileName,
          public_url: publicData.publicUrl,
          sort_order: photos.length,
        });
      }

      // =====================================================
      // 4. SAVE ALL MEDIA RECORDS
      // =====================================================

      if (mediaRows.length > 0) {
        const { error: mediaError } = await supabase
          .from("property_media")
          .insert(mediaRows);

        if (mediaError) {
          throw mediaError;
        }
      }

      // =====================================================
      // 5. FIRST UPLOADED PHOTO = COVER PHOTO
      // =====================================================

      if (photos.length > 0 && mediaRows.length > 0) {
        const firstUploadedPhoto = mediaRows.find(
          (media) => media.media_type === "image"
        );

        if (firstUploadedPhoto) {
          const { error: imageUpdateError } = await supabase
            .from("properties")
            .update({
              image_url: firstUploadedPhoto.public_url,
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
      console.error("Add property error:", error);

      alert(
        error?.message ||
          "Something went wrong while adding the property."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="dashboard-page">
      <nav className="dashboard-nav">
        <a href="/" className="logo">
          STUVANA
        </a>

        <button onClick={() => router.push("/dashboard")}>
          ← Dashboard
        </button>
      </nav>

      <section className="dashboard-header">
        <p className="hero-label">PROPERTY OWNER</p>

        <h1>Add Property</h1>

        <p>
          Submit your student accommodation for admin review.
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
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Madina Student Hostel"
                required
              />
            </label>

            <label>
              Location *
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Madina, Accra"
                required
              />
            </label>

            <label>
              University
              <input
                type="text"
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
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
                    setWalkingMinutes(e.target.value)
                  }
                  placeholder="15"
                />

                <span>mins walk</span>
              </div>
            </label>
          </div>

          <div className="form-section">
            <h2>Room & Pricing</h2>

            <label>
              Room Type *
              <select
                value={roomType}
                onChange={(e) => setRoomType(e.target.value)}
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
                onChange={(e) => setPrice(e.target.value)}
                placeholder="8500"
                required
              />
            </label>

            <p className="upload-help">
              STUVANA will automatically include payment
              processing costs in the final price shown to
              students.
            </p>

            <label>
              Payment Period
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
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
                onChange={(e) => setSpaces(e.target.value)}
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
                  setDescription(e.target.value)
                }
                placeholder="Tell students about the accommodation..."
                rows={6}
              />
            </label>
          </div>

          <div className="form-section">
            <h2>Photos</h2>

            <p className="upload-help">
              Upload photos of the rooms, exterior,
              kitchen, bathroom, surroundings, etc.
              The first photo you select will be used as
              the property's cover photo.
            </p>

            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                setPhotos(
                  Array.from(e.target.files || [])
                );
              }}
            />

            {photos.length > 0 && (
              <p className="selected-files">
                {photos.length} photo
                {photos.length > 1 ? "s" : ""} selected.
                The first selected photo will be the cover
                photo.
              </p>
            )}
          </div>

          <div className="form-section">
            <h2>Property Video</h2>

            <p className="upload-help">
              Optional. Upload a video tour of the property.
            </p>

            <input
              type="file"
              accept="video/*"
              onChange={(e) => {
                setVideo(
                  e.target.files?.[0] || null
                );
              }}
            />

            {video && (
              <p className="selected-files">
                Video selected: {video.name}
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