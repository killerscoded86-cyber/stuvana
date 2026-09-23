"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Booking = {
  id: number;
  student_id: string;
  property_id: number;
  owner_id: string;
  amount: number;
  total_amount: number | null;
  commission_rate: number | null;
  commission_amount: number | null;
  owner_amount: number | null;
  payment_processing_fee: number | null;
  currency: string;
  status: string;
  paystack_reference: string | null;
  paid_at: string | null;
  created_at: string;
  space_reduced: boolean | null;
};

type Property = {
  id: number;
  name: string;
  location: string;
  room_type: string;
  price: number;
  display_price: number | null;
  period: string;
  spaces: number;
  university: string;
  description: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  video_url: string | null;
  walking_minutes: number | null;
  latitude: number | null;
  longitude: number | null;
  owner_id: string;
};

type Owner = {
  full_name: string | null;
  phone: string | null;
  business_name: string | null;
};

function formatMoney(
  amount: number | null | undefined,
  currency = "GHS"
) {
  if (amount === null || amount === undefined) {
    return "GH₵0.00";
  }

  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(amount));
}

function formatDate(date: string | null) {
  if (!date) {
    return "—";
  }

  return new Date(date).toLocaleString("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getStatusClasses(status: string) {
  switch (status.toLowerCase()) {
    case "paid":
      return "bg-green-100 text-green-700";

    case "pending":
      return "bg-yellow-100 text-yellow-700";

    case "failed":
      return "bg-red-100 text-red-700";

    case "reversed":
      return "bg-gray-100 text-gray-700";

    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default function BookingDetailsPage() {
  const params = useParams();
  const router = useRouter();

  const bookingId = String(params.id);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [owner, setOwner] = useState<Owner | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadBooking() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push("/login");
          return;
        }

        const numericBookingId = Number(bookingId);

        if (!Number.isFinite(numericBookingId)) {
          setError("Invalid booking.");
          setLoading(false);
          return;
        }

        /*
         * Get the booking belonging to the logged-in student.
         * The student_id filter prevents another student from
         * viewing someone else's booking.
         */
        const { data: bookingData, error: bookingError } =
          await supabase
            .from("bookings")
            .select("*")
            .eq("id", numericBookingId)
            .eq("student_id", user.id)
            .single();

        if (bookingError || !bookingData) {
          console.error("Booking lookup error:", bookingError);

          setError(
            "We couldn't find this booking or you don't have permission to view it."
          );

          setLoading(false);
          return;
        }

        setBooking(bookingData);

        // Load property
        const { data: propertyData, error: propertyError } =
          await supabase
            .from("properties")
            .select("*")
            .eq("id", bookingData.property_id)
            .single();

        if (propertyError || !propertyData) {
          console.error("Property lookup error:", propertyError);

          setError("The accommodation connected to this booking could not be found.");
          setLoading(false);
          return;
        }

        setProperty(propertyData);

        // Load owner profile
        const { data: ownerData, error: ownerError } =
          await supabase
            .from("profiles")
            .select("full_name, phone, business_name")
            .eq("id", bookingData.owner_id)
            .maybeSingle();

        if (ownerError) {
          console.error("Owner lookup error:", ownerError);
        }

        setOwner(ownerData);
      } catch (err) {
        console.error("Booking details error:", err);
        setError("Something went wrong while loading this booking.");
      } finally {
        setLoading(false);
      }
    }

    loadBooking();
  }, [bookingId, router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <p className="text-gray-600">
              Loading booking details...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !booking || !property) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-2xl">
              !
            </div>

            <h1 className="mt-5 text-2xl font-bold text-gray-900">
              Booking unavailable
            </h1>

            <p className="mt-2 text-gray-600">
              {error || "We couldn't load this booking."}
            </p>

            <Link
              href="/dashboard"
              className="mt-6 inline-block rounded-xl bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const image =
    property.image_url ||
    (property.image_urls && property.image_urls.length > 0
      ? property.image_urls[0]
      : null);

  const mapUrl =
    property.latitude !== null &&
    property.longitude !== null
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${
          property.longitude - 0.005
        }%2C${property.latitude - 0.005}%2C${
          property.longitude + 0.005
        }%2C${property.latitude + 0.005}&layer=mapnik&marker=${
          property.latitude
        }%2C${property.longitude}`
      : null;

  const navigationUrl =
    property.latitude !== null &&
    property.longitude !== null
      ? `https://www.google.com/maps/dir/?api=1&destination=${property.latitude},${property.longitude}`
      : null;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Top navigation */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className="text-sm font-semibold text-gray-700 hover:text-black"
          >
            ← Back to My Accommodation
          </Link>

          <span
            className={`rounded-full px-4 py-2 text-sm font-bold capitalize ${getStatusClasses(
              booking.status
            )}`}
          >
            {booking.status}
          </span>
        </div>

        {/* Booking confirmation */}
        {booking.status.toLowerCase() === "paid" && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-5">
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-600 text-xl text-white">
                ✓
              </div>

              <div>
                <h1 className="font-bold text-green-900">
                  Accommodation Booking Confirmed
                </h1>

                <p className="mt-1 text-sm text-green-800">
                  Your payment was successfully received and your accommodation
                  allocation has been confirmed.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Property header */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="grid md:grid-cols-[420px_1fr]">

            {/* Image */}
            <div className="h-72 bg-gray-100 md:h-full">
              {image ? (
                <img
                  src={image}
                  alt={property.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-6xl">
                  🏠
                </div>
              )}
            </div>

            {/* Main information */}
            <div className="p-6 sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                {property.university}
              </p>

              <h2 className="mt-2 text-3xl font-bold text-gray-900">
                {property.name}
              </h2>

              <p className="mt-2 text-gray-600">
                📍 {property.location}
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">
                    Room Type
                  </p>

                  <p className="mt-1 font-bold text-gray-900">
                    {property.room_type}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">
                    Payment Period
                  </p>

                  <p className="mt-1 font-bold text-gray-900">
                    {property.period}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">
                    Remaining Spaces
                  </p>

                  <p className="mt-1 font-bold text-gray-900">
                    {property.spaces}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">
                    Walking Time
                  </p>

                  <p className="mt-1 font-bold text-gray-900">
                    {property.walking_minutes !== null
                      ? `${property.walking_minutes} minutes`
                      : "Not provided"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Two-column content */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">

          {/* Left/main */}
          <div className="space-y-6 lg:col-span-2">

            {/* Payment details */}
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900">
                Payment Details
              </h2>

              <div className="mt-5 divide-y divide-gray-100">
                <div className="flex items-center justify-between py-3">
                  <span className="text-gray-600">
                    Accommodation
                  </span>

                  <span className="font-semibold text-gray-900">
                    {formatMoney(
                      booking.amount,
                      booking.currency
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between py-3">
                  <span className="text-gray-600">
                    Payment processing
                  </span>

                  <span className="font-semibold text-gray-900">
                    {formatMoney(
                      booking.payment_processing_fee,
                      booking.currency
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between py-4">
                  <span className="text-lg font-bold text-gray-900">
                    Total Paid
                  </span>

                  <span className="text-xl font-bold text-gray-900">
                    {formatMoney(
                      booking.total_amount ?? booking.amount,
                      booking.currency
                    )}
                  </span>
                </div>
              </div>
            </section>

            {/* Booking information */}
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900">
                Booking Information
              </h2>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-gray-500">
                    Booking ID
                  </p>

                  <p className="mt-1 font-semibold text-gray-900">
                    #{booking.id}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Payment Status
                  </p>

                  <p className="mt-1 font-semibold capitalize text-gray-900">
                    {booking.status}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Booking Date
                  </p>

                  <p className="mt-1 font-semibold text-gray-900">
                    {formatDate(booking.created_at)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Payment Date
                  </p>

                  <p className="mt-1 font-semibold text-gray-900">
                    {formatDate(booking.paid_at)}
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <p className="text-xs text-gray-500">
                    Paystack Reference
                  </p>

                  <p className="mt-1 break-all font-mono text-sm font-semibold text-gray-900">
                    {booking.paystack_reference || "—"}
                  </p>
                </div>
              </div>
            </section>

            {/* Accommodation description */}
            {property.description && (
              <section className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900">
                  About This Accommodation
                </h2>

                <p className="mt-4 whitespace-pre-line leading-7 text-gray-600">
                  {property.description}
                </p>
              </section>
            )}

            {/* Map */}
            {mapUrl && (
              <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className="p-6 pb-4">
                  <h2 className="text-xl font-bold text-gray-900">
                    Accommodation Location
                  </h2>

                  <p className="mt-1 text-sm text-gray-600">
                    {property.location}
                  </p>
                </div>

                <iframe
                  src={mapUrl}
                  title="Accommodation location"
                  className="h-80 w-full border-0"
                  loading="lazy"
                />

                {navigationUrl && (
                  <div className="p-5">
                    <a
                      href={navigationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-xl bg-black px-5 py-3 text-center font-semibold text-white hover:bg-gray-800"
                    >
                      🗺️ Get Directions
                    </a>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-6">

            {/* Owner */}
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900">
                Property Owner
              </h2>

              <div className="mt-5">
                <p className="font-semibold text-gray-900">
                  {owner?.business_name ||
                    owner?.full_name ||
                    "Property Owner"}
                </p>

                {owner?.full_name &&
                  owner.business_name && (
                    <p className="mt-1 text-sm text-gray-500">
                      {owner.full_name}
                    </p>
                  )}

                {owner?.phone ? (
                  <a
                    href={`tel:${owner.phone}`}
                    className="mt-4 block rounded-xl border border-gray-200 px-4 py-3 text-center font-semibold text-gray-800 hover:bg-gray-50"
                  >
                    📞 Call Owner
                  </a>
                ) : (
                  <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
                    📞 Owner phone number not provided
                  </p>
                )}
              </div>
            </section>

            {/* Property button */}
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900">
                Accommodation
              </h2>

              <p className="mt-2 text-sm text-gray-600">
                View the full accommodation listing, photos and available
                information.
              </p>

              <Link
                href={`/property/${property.id}`}
                className="mt-5 block rounded-xl border border-gray-200 px-5 py-3 text-center font-semibold text-gray-900 hover:bg-gray-50"
              >
                View Property
              </Link>
            </section>

            {/* Booking status */}
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900">
                Booking Status
              </h2>

              <div className="mt-4 flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    booking.status.toLowerCase() === "paid"
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {booking.status.toLowerCase() === "paid"
                    ? "✓"
                    : "!"}
                </div>

                <div>
                  <p className="font-semibold capitalize text-gray-900">
                    {booking.status}
                  </p>

                  <p className="text-sm text-gray-500">
                    {booking.status.toLowerCase() === "paid"
                      ? "Your accommodation is confirmed."
                      : "Payment has not been fully completed."}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}