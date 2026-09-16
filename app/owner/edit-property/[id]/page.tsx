"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PropertyMedia = {
  id: number;
  property_id: number;
  media_type: "image" | "video";
  storage_path: string;
  public_url: string;
  sort_order: number;
  created_at?: string;
};

export default function EditPropertyPage() {
  const router = useRouter();
  const params = useParams();

  const rawId = params?.id;
  const propertyId = Number(
    Array.isArray(rawId) ? rawId[0] : rawId
  );

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

  const [media, setMedia] = useState<PropertyMedia[]>([]);
  const [mainImageUrl, setMainImageUrl] = useState<string | null>(null);

  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [newVideo, setNewVideo] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingMediaId, setDeletingMediaId] =
    useState<number | null>(null);

  useEffect(() => {
    async function loadProperty() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      if (!propertyId || Number.isNaN(propertyId)) {
        alert("Invalid property.");
        router.push("/owner/dashboard");
        return;
      }

      const { data: property, error: propertyError } =
        await supabase
          .from("properties")
          .select("*")
          .eq("id", propertyId)
          .eq("owner_id", user.id)
          .single();

      if (propertyError || !property) {
        console.error(
          "Load property error:",
          propertyError
        );

        alert(
          "Property not found or you do not have permission to edit it."
        );

        router.push("/owner/dashboard");
        return;
      }

      setName(property.name || "");
      setLocation(property.location || "");
      setRoomType(property.room_type || "");
      setPrice(property.price?.toString() || "");
      setPeriod(property.period || "Per Semester");
      setSpaces(property.spaces?.toString() || "");
      setUniversity(property.university || "");
      setWalkingMinutes(
        property.walking_minutes?.toString() || ""
      );
      setDescription(property.description || "");
      setMainImageUrl(property.image_url || null);

      setLatitude(
        typeof property.latitude === "number"
          ? property.latitude
          : null
      );

      setLongitude(
        typeof property.longitude === "number"
          ? property.longitude
          : null
      );

      const { data: mediaData, error: mediaError } =
        await supabase
          .from("property_media")
          .select("*")
          .eq("property_id", propertyId)
          .order("sort_order", {
            ascending: true,
          });

      if (mediaError) {
        console.error(
          "Load property media error:",
          mediaError
        );
      }

      setMedia(mediaData || []);
      setLoading(false);
    }

    loadProperty();
  }, [propertyId, router]);

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
        "Please select the property's precise location on the map before saving."
      );
      return;
    }

    const basePrice = Number(price);

    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      alert("Please enter a valid property price.");
      return;
    }

    setSaving(true);

    const uploadedStoragePaths: string[] = [];

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("Please log in first.");
        router.push("/login");
        return;
      }

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("account_type")
          .eq("id", user.id)
          .single();

      if (profileError || profile?.account_type !== "owner") {
        alert("Only property owners can edit properties.");
        return;
      }

      /* --------------------------------
         CALCULATE FINAL STUDENT PRICE
      -------------------------------- */

      const paystackFeeRate = 0.0195;

      const basePricePesewas = Math.round(
        basePrice * 100
      );

      const displayPricePesewas = Math.ceil(
        basePricePesewas / (1 - paystackFeeRate)
      );

      const displayPrice =
        displayPricePesewas / 100;

      /* --------------------------------
         UPDATE PROPERTY DETAILS
      -------------------------------- */

      const { error: propertyError } = await supabase
        .from("properties")
        .update({
          name,
          location,
          room_type: roomType,
          price: basePrice,
          display_price: displayPrice,
          period,
          spaces: Number(spaces),
          university: university || null,
          walking_minutes: walkingMinutes
            ? Number(walkingMinutes)
            : null,
          description: description || null,
          latitude,
          longitude,
        })
        .eq("id", propertyId)
        .eq("owner_id", user.id);

      if (propertyError) {
        throw propertyError;
      }

      /* --------------------------------
         UPLOAD NEW PHOTOS
      -------------------------------- */

      let updatedMedia = [...media];

      let nextSortOrder =
        media.length > 0
          ? Math.max(
              ...media.map((item) => item.sort_order)
            ) + 1
          : 0;

      const newPhotoRows: PropertyMedia[] = [];

      for (const photo of newPhotos) {
        const fileExt =
          photo.name.split(".").pop()?.toLowerCase() || "jpg";

        const fileName = `${user.id}/${propertyId}/images/${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } =
          await supabase.storage
            .from("property-media")
            .upload(fileName, photo);

        if (uploadError) {
          throw uploadError;
        }

        uploadedStoragePaths.push(fileName);

        const { data: publicData } =
          supabase.storage
            .from("property-media")
            .getPublicUrl(fileName);

        newPhotoRows.push({
          id: 0,
          property_id: propertyId,
          media_type: "image",
          storage_path: fileName,
          public_url: publicData.publicUrl,
          sort_order: nextSortOrder++,
        });
      }

      if (newPhotoRows.length > 0) {
        const {
          data: insertedPhotos,
          error: photoError,
        } = await supabase
          .from("property_media")
          .insert(
            newPhotoRows.map((photo) => ({
              property_id: photo.property_id,
              media_type: photo.media_type,
              storage_path: photo.storage_path,
              public_url: photo.public_url,
              sort_order: photo.sort_order,
            }))
          )
          .select();

        if (photoError) {
          throw photoError;
        }

        updatedMedia = [
          ...updatedMedia,
          ...(insertedPhotos || []),
        ];

        /* If property has no main image, make first new photo main */
        if (!mainImageUrl && insertedPhotos?.length) {
          const firstPhoto = insertedPhotos[0];

          const {
            error: mainImageError,
          } = await supabase
            .from("properties")
            .update({
              image_url: firstPhoto.public_url,
            })
            .eq("id", propertyId)
            .eq("owner_id", user.id);

          if (mainImageError) {
            throw mainImageError;
          }

          setMainImageUrl(
            firstPhoto.public_url
          );
        }
      }

      /* --------------------------------
         REPLACE PROPERTY VIDEO
      -------------------------------- */

      if (newVideo) {
        const existingVideo = media.find(
          (item) =>
            item.media_type === "video"
        );

        const fileExt =
          newVideo.name.split(".").pop()?.toLowerCase() ||
          "mp4";

        const fileName = `${user.id}/${propertyId}/videos/${crypto.randomUUID()}.${fileExt}`;

        const {
          error: videoUploadError,
        } = await supabase.storage
          .from("property-media")
          .upload(fileName, newVideo);

        if (videoUploadError) {
          throw videoUploadError;
        }

        uploadedStoragePaths.push(fileName);

        const { data: publicData } =
          supabase.storage
            .from("property-media")
            .getPublicUrl(fileName);

        const {
          data: insertedVideo,
          error: videoInsertError,
        } = await supabase
          .from("property_media")
          .insert({
            property_id: propertyId,
            media_type: "video",
            storage_path: fileName,
            public_url: publicData.publicUrl,
            sort_order: nextSortOrder,
          })
          .select()
          .single();

        if (videoInsertError) {
          throw videoInsertError;
        }

        /* Delete old video after new video is successfully saved */
        if (existingVideo) {
          const {
            error: oldVideoStorageError,
          } = await supabase.storage
            .from("property-media")
            .remove([
              existingVideo.storage_path,
            ]);

          if (oldVideoStorageError) {
            console.error(
              "Old video storage delete error:",
              oldVideoStorageError
            );
          }

          const {
            error: oldVideoDbError,
          } = await supabase
            .from("property_media")
            .delete()
            .eq("id", existingVideo.id);

          if (oldVideoDbError) {
            console.error(
              "Old video database delete error:",
              oldVideoDbError
            );
          }
        }

        updatedMedia = [
          ...updatedMedia.filter(
            (item) =>
              item.media_type !== "video"
          ),
          insertedVideo,
        ];
      }

      setMedia(updatedMedia);
      setNewPhotos([]);
      setNewVideo(null);

      alert(
        "Property updated successfully!"
      );

      router.push("/owner/dashboard");
    } catch (error: any) {
      console.error(
        "Edit property error:",
        error
      );

      /* Clean up newly uploaded files if something failed */
      if (uploadedStoragePaths.length > 0) {
        await supabase.storage
          .from("property-media")
          .remove(
            uploadedStoragePaths
          );
      }

      alert(
        error?.message ||
          "Something went wrong while updating the property."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteMedia(item: PropertyMedia) {
    const confirmed = window.confirm(
      item.media_type === "video"
        ? "Are you sure you want to delete this video?"
        : "Are you sure you want to delete this photo?"
    );

    if (!confirmed) return;

    setDeletingMediaId(item.id);

    try {
      const {
        error: storageError,
      } = await supabase.storage
        .from("property-media")
        .remove([item.storage_path]);

      if (storageError) {
        throw storageError;
      }

      const { error: dbError } =
        await supabase
          .from("property_media")
          .delete()
          .eq("id", item.id)
          .eq("property_id", propertyId);

      if (dbError) {
        throw dbError;
      }

      const remainingMedia = media.filter(
        (mediaItem) =>
          mediaItem.id !== item.id
      );

      setMedia(remainingMedia);

      /* If deleted image was the main image */
      if (
        item.media_type === "image" &&
        mainImageUrl === item.public_url
      ) {
        const nextImage =
          remainingMedia.find(
            (mediaItem) =>
              mediaItem.media_type ===
              "image"
          );

        const nextImageUrl = nextImage
          ? nextImage.public_url
          : null;

        const {
          error: imageUpdateError,
        } = await supabase
          .from("properties")
          .update({
            image_url: nextImageUrl,
          })
          .eq("id", propertyId)
          .eq("owner_id", (
            await supabase.auth.getUser()
          ).data.user?.id);

        if (imageUpdateError) {
          throw imageUpdateError;
        }

        setMainImageUrl(nextImageUrl);
      }

      alert(
        item.media_type === "video"
          ? "Video deleted successfully."
          : "Photo deleted successfully."
      );
    } catch (error: any) {
      console.error(
        "Delete media error:",
        error
      );

      alert(
        error?.message ||
          "Could not delete this media file."
      );
    } finally {
      setDeletingMediaId(null);
    }
  }

  async function setMainImage(
    publicUrl: string
  ) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("Please log in again.");
        router.push("/login");
        return;
      }

      const { error } = await supabase
        .from("properties")
        .update({
          image_url: publicUrl,
        })
        .eq("id", propertyId)
        .eq("owner_id", user.id);

      if (error) {
        throw error;
      }

      setMainImageUrl(publicUrl);

      alert(
        "Main property photo updated."
      );
    } catch (error: any) {
      console.error(
        "Set main image error:",
        error
      );

      alert(
        error?.message ||
          "Could not set this photo as the main image."
      );
    }
  }

  if (loading) {
    return (
      <main className="dashboard-page">
        <nav className="dashboard-nav">
          <a href="/" className="logo">
            STUVANA
          </a>
        </nav>

        <section className="dashboard-header">
          <p className="hero-label">
            PROPERTY OWNER
          </p>

          <h1>
            Loading Property...
          </h1>

          <p>
            Please wait while we load your property.
          </p>
        </section>
      </main>
    );
  }

  const existingPhotos = media.filter(
    (item) =>
      item.media_type === "image"
  );

  const existingVideo = media.find(
    (item) =>
      item.media_type === "video"
  );

  const mapEmbedUrl =
    latitude !== null &&
    longitude !== null
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.005}%2C${latitude - 0.005}%2C${longitude + 0.005}%2C${latitude + 0.005}&layer=mapnik&marker=${latitude}%2C${longitude}`
      : null;

  return (
    <main className="dashboard-page">
      <nav className="dashboard-nav">
        <a href="/" className="logo">
          STUVANA
        </a>

        <button
          onClick={() =>
            router.push(
              "/owner/dashboard"
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
          Edit Property
        </h1>

        <p>
          Update your accommodation details,
          photos, video and location.
        </p>
      </section>

      <section className="add-property-container">
        <form
          className="add-property-form"
          onSubmit={handleSubmit}
        >
          {/* PROPERTY INFORMATION */}

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

          {/* PRECISE PROPERTY LOCATION */}

          <div className="form-section">
            <h2>
              Precise Property Location
            </h2>

            <p className="upload-help">
              Update the exact property
              position using your device's
              precise location.
            </p>

            <button
              type="button"
              onClick={
                usePreciseLocation
              }
              disabled={
                gettingLocation
              }
              className="details-secondary-button"
              style={{
                marginBottom:
                  "16px",
                cursor:
                  gettingLocation
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
                  src={
                    mapEmbedUrl
                  }
                  style={{
                    width: "100%",
                    height: "350px",
                    border: 0,
                    display:
                      "block",
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
                  textAlign:
                    "center",
                  padding:
                    "20px",
                  color:
                    "#6b7280",
                }}
              >
                No precise property
                location has been
                selected yet.
              </div>
            )}
          </div>

          {/* ROOM & PRICING */}

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
                  setPrice(
                    e.target.value
                  )
                }
                placeholder="8500"
                required
              />
            </label>

            <p className="upload-help">
              STUVANA automatically includes
              payment processing costs in the
              final price shown to students.
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

          {/* DESCRIPTION */}

          <div className="form-section">
            <h2>
              Description
            </h2>

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

          {/* EXISTING PHOTOS */}

          <div className="form-section">
            <h2>
              Property Photos
            </h2>

            {existingPhotos.length === 0 ? (
              <p className="upload-help">
                No photos have been uploaded yet.
              </p>
            ) : (
              <div className="edit-media-grid">
                {existingPhotos.map(
                  (photo) => (
                    <div
                      className="edit-media-card"
                      key={photo.id}
                    >
                      <div className="edit-media-preview">
                        <img
                          src={
                            photo.public_url
                          }
                          alt={name}
                        />

                        {mainImageUrl ===
                          photo.public_url && (
                          <span className="main-photo-badge">
                            MAIN PHOTO
                          </span>
                        )}
                      </div>

                      <div className="edit-media-actions">
                        {mainImageUrl !==
                          photo.public_url && (
                          <button
                            type="button"
                            onClick={() =>
                              setMainImage(
                                photo.public_url
                              )
                            }
                          >
                            Set as Main
                          </button>
                        )}

                        <button
                          type="button"
                          className="media-delete-button"
                          disabled={
                            deletingMediaId ===
                            photo.id
                          }
                          onClick={() =>
                            deleteMedia(
                              photo
                            )
                          }
                        >
                          {deletingMediaId ===
                          photo.id
                            ? "Deleting..."
                            : "Delete"}
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            <div className="media-upload-box">
              <label>
                Add More Photos

                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    setNewPhotos(
                      Array.from(
                        e.target.files ||
                          []
                      )
                    );
                  }}
                />
              </label>

              {newPhotos.length >
                0 && (
                <p className="selected-files">
                  {newPhotos.length} new
                  photo
                  {newPhotos.length >
                  1
                    ? "s"
                    : ""}{" "}
                  selected
                </p>
              )}
            </div>
          </div>

          {/* EXISTING VIDEO */}

          <div className="form-section">
            <h2>
              Property Video
            </h2>

            {existingVideo ? (
              <div className="existing-video-container">
                <video
                  src={
                    existingVideo.public_url
                  }
                  controls
                  playsInline
                  className="existing-property-video"
                />

                <button
                  type="button"
                  className="media-delete-button"
                  disabled={
                    deletingMediaId ===
                    existingVideo.id
                  }
                  onClick={() =>
                    deleteMedia(
                      existingVideo
                    )
                  }
                >
                  {deletingMediaId ===
                  existingVideo.id
                    ? "Deleting..."
                    : "Delete Video"}
                </button>
              </div>
            ) : (
              <p className="upload-help">
                No property video has been
                uploaded yet.
              </p>
            )}

            <div className="media-upload-box">
              <label>
                {existingVideo
                  ? "Replace Property Video"
                  : "Add Property Video"}

                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => {
                    setNewVideo(
                      e.target.files?.[0] ||
                        null
                    );
                  }}
                />
              </label>

              {newVideo && (
                <p className="selected-files">
                  New video selected:{" "}
                  {newVideo.name}
                </p>
              )}
            </div>
          </div>

          {/* SAVE */}

          <button
            type="submit"
            className="add-property-submit"
            disabled={saving}
          >
            {saving
              ? "Saving Changes..."
              : "Save Changes"}
          </button>
        </form>
      </section>
    </main>
  );
}