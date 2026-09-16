"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Booking = {
  id: number;
  student_id: string;
  property_id: number;
  owner_id: string;
  amount: number;
  total_amount: number;
  status: string;
  paid_at: string | null;
  created_at: string | null;
  paystack_reference: string | null;
};

type Property = {
  id: number;
  name: string;
  location: string | null;
  room_type: string | null;
};

type StudentProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  university: string | null;
};

type StudentBooking = Booking & {
  property: Property | null;
  student: StudentProfile | null;
};

export default function OwnerStudentsPage() {
  const router = useRouter();

  const [bookings, setBookings] = useState<
    StudentBooking[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    async function loadStudents() {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      /* VERIFY OWNER ACCOUNT */

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .maybeSingle();

      if (
        profileError ||
        !profile ||
        profile.account_type !== "owner"
      ) {
        setError(
          "You do not have permission to view students."
        );
        setLoading(false);
        return;
      }

      /* LOAD PAID BOOKINGS */

      const {
        data: bookingData,
        error: bookingError,
      } = await supabase
        .from("bookings")
        .select("*")
        .eq("owner_id", user.id)
        .eq("status", "paid")
        .order("paid_at", {
          ascending: false,
        });

      if (bookingError) {
        console.error(
          "Bookings error:",
          bookingError
        );

        setError(
          "Could not load your student bookings."
        );

        setLoading(false);
        return;
      }

      const loadedBookings =
        (bookingData || []) as Booking[];

      if (
        loadedBookings.length === 0
      ) {
        setBookings([]);
        setLoading(false);
        return;
      }

      /* LOAD PROPERTIES */

      const propertyIds =
        Array.from(
          new Set(
            loadedBookings.map(
              (booking) =>
                booking.property_id
            )
          )
        );

      const {
        data: propertyData,
        error: propertyError,
      } = await supabase
        .from("properties")
        .select(
          "id, name, location, room_type"
        )
        .in(
          "id",
          propertyIds
        );

      if (propertyError) {
        console.error(
          "Properties error:",
          propertyError
        );
      }

      const propertyMap =
        new Map<
          number,
          Property
        >();

      (
        (propertyData ||
          []) as Property[]
      ).forEach(
        (property) => {
          propertyMap.set(
            property.id,
            property
          );
        }
      );

      /* LOAD STUDENT PROFILES */

      const studentIds =
        Array.from(
          new Set(
            loadedBookings.map(
              (booking) =>
                booking.student_id
            )
          )
        );

      const {
        data: studentData,
        error: studentError,
      } = await supabase
        .from("profiles")
        .select(
          "id, full_name, phone, university"
        )
        .in(
          "id",
          studentIds
        );

      if (studentError) {
        console.error(
          "Student profiles error:",
          studentError
        );
      }

      const studentMap =
        new Map<
          string,
          StudentProfile
        >();

      (
        (studentData ||
          []) as StudentProfile[]
      ).forEach(
        (student) => {
          studentMap.set(
            student.id,
            student
          );
        }
      );

      const combinedBookings =
        loadedBookings.map(
          (booking) => ({
            ...booking,
            property:
              propertyMap.get(
                booking.property_id
              ) || null,
            student:
              studentMap.get(
                booking.student_id
              ) || null,
          })
        );

      setBookings(
        combinedBookings
      );

      setLoading(false);
    }

    loadStudents();
  }, [router]);

  /*
   * Group bookings by property so the owner
   * can clearly see which students booked
   * each accommodation.
   */
  const groupedByProperty =
    bookings.reduce<
      Record<
        number,
        {
          property: Property | null;
          bookings: StudentBooking[];
        }
      >
    >((groups, booking) => {
      if (
        !groups[
          booking.property_id
        ]
      ) {
        groups[
          booking.property_id
        ] = {
          property:
            booking.property,
          bookings: [],
        };
      }

      groups[
        booking.property_id
      ].bookings.push(
        booking
      );

      return groups;
    }, {});

  if (loading) {
    return (
      <main className="dashboard-page">
        <section className="dashboard-header">
          <p className="hero-label">
            STUVANA
          </p>

          <h1>
            Loading students...
          </h1>

          <p>
            Please wait while we load
            your confirmed bookings.
          </p>
        </section>
      </main>
    );
  }

  if (error) {
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
            type="button"
            onClick={() =>
              router.push(
                "/dashboard"
              )
            }
          >
            Back to Dashboard
          </button>
        </nav>

        <section className="dashboard-header">
          <p className="hero-label">
            STUVANA
          </p>

          <h1>
            Unable to load students
          </h1>

          <p
            style={{
              color: "#991b1b",
              marginTop:
                "12px",
            }}
          >
            {error}
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

        <div
          className="dashboard-nav-actions"
        >
          <button
            type="button"
            onClick={() =>
              router.push(
                "/dashboard"
              )
            }
          >
            Dashboard
          </button>

          <button
            type="button"
            onClick={() =>
              router.push("/profile")
            }
          >
            My Profile
          </button>
        </div>
      </nav>

      <section className="dashboard-header">
        <p className="hero-label">
          PROPERTY OWNER
        </p>

        <h1>
          Your Students
        </h1>

        <p>
          Students who have successfully
          paid for your accommodation
          are listed below.
        </p>

        <div
          style={{
            display: "inline-flex",
            alignItems:
              "center",
            gap: "10px",
            marginTop:
              "18px",
            padding:
              "12px 18px",
            borderRadius:
              "999px",
            background:
              "#eff6ff",
            border:
              "1px solid #bfdbfe",
            color:
              "#1e40af",
            fontWeight:
              700,
          }}
        >
          👨‍🎓{" "}
          {bookings.length}{" "}
          confirmed{" "}
          {bookings.length ===
          1
            ? "booking"
            : "bookings"}
        </div>
      </section>

      <section
        style={{
          width: "100%",
          maxWidth:
            "1200px",
          margin:
            "0 auto",
          padding:
            "0 20px 60px",
        }}
      >
        {bookings.length ===
        0 ? (
          <div className="owner-empty-state">
            <div className="owner-empty-icon">
              👨‍🎓
            </div>

            <h3>
              No students yet
            </h3>

            <p>
              When a student successfully
              pays for one of your
              properties, their booking
              will appear here.
            </p>

            <button
              type="button"
              className="details-primary-button"
              onClick={() =>
                router.push(
                  "/dashboard"
                )
              }
            >
              Back to Dashboard
            </button>
          </div>
        ) : (
          <div
            style={{
              display:
                "grid",
              gap:
                "28px",
            }}
          >
            {Object.values(
              groupedByProperty
            ).map(
              (group) => {
                return (
                  <section
                    key={
                      group
                        .property
                        ?.id ||
                      Math.random()
                    }
                    style={{
                      background:
                        "#ffffff",
                      border:
                        "1px solid #e5e7eb",
                      borderRadius:
                        "18px",
                      padding:
                        "22px",
                      boxShadow:
                        "0 4px 16px rgba(0,0,0,0.05)",
                    }}
                  >
                    <div
                      style={{
                        display:
                          "flex",
                        justifyContent:
                          "space-between",
                        alignItems:
                          "flex-start",
                        gap:
                          "16px",
                        flexWrap:
                          "wrap",
                        marginBottom:
                          "20px",
                      }}
                    >
                      <div>
                        <p className="hero-label">
                          PROPERTY
                        </p>

                        <h2
                          style={{
                            marginTop:
                              "4px",
                          }}
                        >
                          {group
                            .property
                            ?.name ||
                            "Property"}
                        </h2>

                        <p
                          style={{
                            marginTop:
                              "6px",
                            color:
                              "#666",
                          }}
                        >
                          📍{" "}
                          {group
                            .property
                            ?.location ||
                            "Location not specified"}
                        </p>
                      </div>

                      <div
                        style={{
                          padding:
                            "10px 14px",
                          borderRadius:
                            "999px",
                          background:
                            "#dcfce7",
                          color:
                            "#166534",
                          fontWeight:
                            700,
                        }}
                      >
                        {
                          group
                            .bookings
                            .length
                        }{" "}
                        student
                        {group
                          .bookings
                          .length ===
                        1
                          ? ""
                          : "s"}
                      </div>
                    </div>

                    <div
                      style={{
                        display:
                          "grid",
                        gap:
                          "14px",
                      }}
                    >
                      {group.bookings.map(
                        (
                          booking
                        ) => (
                          <article
                            key={
                              booking.id
                            }
                            style={{
                              border:
                                "1px solid #e5e7eb",
                              borderRadius:
                                "14px",
                              padding:
                                "18px",
                              background:
                                "#fafafa",
                            }}
                          >
                            <div
                              style={{
                                display:
                                  "grid",
                                gridTemplateColumns:
                                  "minmax(0, 1fr) auto",
                                gap:
                                  "18px",
                                alignItems:
                                  "start",
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    display:
                                      "flex",
                                    alignItems:
                                      "center",
                                    gap:
                                      "10px",
                                    flexWrap:
                                      "wrap",
                                  }}
                                >
                                  <h3
                                    style={{
                                      margin:
                                        0,
                                    }}
                                  >
                                    {booking
                                      .student
                                      ?.full_name ||
                                      "Student"}
                                  </h3>

                                  <span
                                    style={{
                                      padding:
                                        "5px 9px",
                                      borderRadius:
                                        "999px",
                                      background:
                                        "#dcfce7",
                                      color:
                                        "#166534",
                                      fontSize:
                                        "12px",
                                      fontWeight:
                                        700,
                                    }}
                                  >
                                    PAID
                                  </span>
                                </div>

                                <div
                                  style={{
                                    display:
                                      "grid",
                                    gap:
                                      "7px",
                                    marginTop:
                                      "12px",
                                    color:
                                      "#4b5563",
                                    fontSize:
                                      "14px",
                                  }}
                                >
                                  <p
                                    style={{
                                      margin:
                                        0,
                                    }}
                                  >
                                    🎓{" "}
                                    {booking
                                      .student
                                      ?.university ||
                                      "University not specified"}
                                  </p>

                                  <p
                                    style={{
                                      margin:
                                        0,
                                    }}
                                  >
                                    📞{" "}
                                    {booking
                                      .student
                                      ?.phone ||
                                      "No phone number provided"}
                                  </p>

                                  <p
                                    style={{
                                      margin:
                                        0,
                                    }}
                                  >
                                    🏠{" "}
                                    {booking
                                      .property
                                      ?.room_type ||
                                      "Room type not specified"}
                                  </p>

                                  <p
                                    style={{
                                      margin:
                                        0,
                                    }}
                                  >
                                    💰 Paid: GH₵{" "}
                                    {Number(
                                      booking.total_amount
                                    ).toLocaleString()}
                                  </p>

                                  <p
                                    style={{
                                      margin:
                                        0,
                                    }}
                                  >
                                    📅{" "}
                                    {booking.paid_at
                                      ? new Date(
                                          booking.paid_at
                                        ).toLocaleString()
                                      : "Payment date unavailable"}
                                  </p>

                                  <p
                                    style={{
                                      margin:
                                        0,
                                        fontSize:
                                        "12px",
                                      color:
                                        "#777",
                                      wordBreak:
                                        "break-word",
                                    }}
                                  >
                                    Reference:{" "}
                                    {booking.paystack_reference ||
                                      "Unavailable"}
                                  </p>
                                </div>
                              </div>

                              <a
                                href={`tel:${booking.student?.phone || ""}`}
                                style={{
                                  display:
                                    "inline-flex",
                                  alignItems:
                                    "center",
                                  justifyContent:
                                    "center",
                                  padding:
                                    "10px 14px",
                                  borderRadius:
                                    "10px",
                                  background:
                                    "#111827",
                                  color:
                                    "#ffffff",
                                  textDecoration:
                                    "none",
                                  fontWeight:
                                    700,
                                  whiteSpace:
                                    "nowrap",
                                }}
                              >
                                📞 Call Student
                              </a>
                            </div>
                          </article>
                        )
                      )}
                    </div>
                  </section>
                );
              }
            )}
          </div>
        )}
      </section>
    </main>
  );
}