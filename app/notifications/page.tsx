"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type StudentNotification = {
  id: number;
  student_id: string;
  property_id: number | null;
  booking_id: number | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export default function StudentNotificationsPage() {
  const router = useRouter();

  const [notifications, setNotifications] = useState<
    StudentNotification[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    async function loadNotifications() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUser(user);

      const { data, error } = await supabase
        .from("student_notifications")
        .select("*")
        .eq("student_id", user.id)
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        console.error(
          "Student notifications error:",
          error
        );

        setNotifications([]);
        setLoading(false);
        return;
      }

      setNotifications(
        (data || []) as StudentNotification[]
      );

      setLoading(false);
    }

    loadNotifications();
  }, [router]);

  async function markAsRead(notificationId: number) {
    if (!user) return;

    const notification = notifications.find(
      (item) => item.id === notificationId
    );

    if (!notification || notification.is_read) {
      return;
    }

    const { error } = await supabase
      .from("student_notifications")
      .update({
        is_read: true,
      })
      .eq("id", notificationId)
      .eq("student_id", user.id);

    if (error) {
      console.error(
        "Mark notification as read error:",
        error
      );

      return;
    }

    setNotifications((current) =>
      current.map((item) =>
        item.id === notificationId
          ? {
              ...item,
              is_read: true,
            }
          : item
      )
    );
  }

  async function markAllAsRead() {
    if (!user) return;

    const unreadCount = notifications.filter(
      (notification) => !notification.is_read
    ).length;

    if (unreadCount === 0) {
      return;
    }

    const { error } = await supabase
      .from("student_notifications")
      .update({
        is_read: true,
      })
      .eq("student_id", user.id)
      .eq("is_read", false);

    if (error) {
      console.error(
        "Mark all notifications as read error:",
        error
      );

      alert("Could not mark notifications as read.");
      return;
    }

    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        is_read: true,
      }))
    );
  }

  const unreadCount = notifications.filter(
    (notification) => !notification.is_read
  ).length;

  if (loading) {
    return (
      <main className="dashboard-page">
        <section className="dashboard-header">
          <p className="hero-label">STUVANA</p>

          <h1>Loading notifications...</h1>

          <p
            style={{
              marginTop: "10px",
              color: "#666",
            }}
          >
            Please wait while we load your notifications.
          </p>
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

        <div
          className="dashboard-nav-actions"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
          >
            Dashboard
          </button>

          <button
            type="button"
            onClick={() => router.push("/")}
          >
            Find Housing
          </button>

          <button
            type="button"
            onClick={() => router.push("/profile")}
          >
            My Profile
          </button>
        </div>
      </nav>

      <section className="dashboard-header">
        <p className="hero-label">
          STUDENT ACCOUNT
        </p>

        <h1>Notifications</h1>

        <p>
          Stay updated about your accommodation and bookings.
        </p>
      </section>

      <section
        style={{
          width: "100%",
          maxWidth: "900px",
          margin: "0 auto",
          padding: "0 20px 60px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap",
            marginBottom: "20px",
          }}
        >
          <div>
            <h2>Your Notifications</h2>

            <p
              style={{
                marginTop: "6px",
                color: "#666",
              }}
            >
              {unreadCount === 0
                ? "You're all caught up."
                : `${unreadCount} unread ${
                    unreadCount === 1
                      ? "notification"
                      : "notifications"
                  }`}
            </p>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
            >
              Mark All as Read
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div
            style={{
              padding: "40px 24px",
              textAlign: "center",
              borderRadius: "18px",
              border: "1px solid #e5e7eb",
              background: "#ffffff",
            }}
          >
            <div
              style={{
                fontSize: "48px",
                marginBottom: "14px",
              }}
            >
              🔔
            </div>

            <h2>No Notifications Yet</h2>

            <p
              style={{
                marginTop: "8px",
                color: "#666",
              }}
            >
              We'll notify you when there is an update
              about your accommodation or booking.
            </p>

            <button
              type="button"
              onClick={() => router.push("/")}
              style={{
                marginTop: "20px",
              }}
            >
              Find Accommodation
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "14px",
            }}
          >
            {notifications.map((notification) => (
              <article
                key={notification.id}
                onClick={() =>
                  markAsRead(notification.id)
                }
                style={{
                  padding: "20px",
                  borderRadius: "16px",
                  border: notification.is_read
                    ? "1px solid #e5e7eb"
                    : "1px solid #bfdbfe",
                  background: notification.is_read
                    ? "#ffffff"
                    : "#eff6ff",
                  boxShadow: notification.is_read
                    ? "0 2px 8px rgba(0,0,0,0.03)"
                    : "0 5px 16px rgba(37,99,235,0.08)",
                  cursor: notification.is_read
                    ? "default"
                    : "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "14px",
                      alignItems: "flex-start",
                    }}
                  >
                    <div
                      style={{
                        width: "44px",
                        height: "44px",
                        minWidth: "44px",
                        borderRadius: "50%",
                        background: notification.is_read
                          ? "#f3f4f6"
                          : "#dbeafe",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "20px",
                      }}
                    >
                      {notification.type ===
                      "booking_confirmed"
                        ? "🎉"
                        : notification.type ===
                          "property_update"
                        ? "🏠"
                        : "🔔"}
                    </div>

                    <div>
                      <h3 style={{ margin: 0 }}>
                        {notification.title}
                      </h3>

                      <p
                        style={{
                          marginTop: "7px",
                          lineHeight: 1.6,
                          color: "#555",
                        }}
                      >
                        {notification.message}
                      </p>

                      <p
                        style={{
                          marginTop: "10px",
                          fontSize: "12px",
                          color: "#888",
                        }}
                      >
                        {new Date(
                          notification.created_at
                        ).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {!notification.is_read && (
                    <span
                      style={{
                        padding: "5px 9px",
                        borderRadius: "999px",
                        background: "#2563eb",
                        color: "#ffffff",
                        fontSize: "11px",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      NEW
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                    marginTop: "16px",
                    marginLeft: "58px",
                  }}
                >
                  {notification.property_id && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        markAsRead(notification.id);
                        router.push(
                          `/property/${notification.property_id}`
                        );
                      }}
                    >
                      View Property
                    </button>
                  )}

                  {notification.booking_id && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        markAsRead(notification.id);
                        router.push("/dashboard");
                      }}
                    >
                      View Booking
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}