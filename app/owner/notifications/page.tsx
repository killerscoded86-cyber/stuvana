"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type OwnerNotification = {
  id: number;
  owner_id: string;
  property_id: number | null;
  booking_id: number | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export default function OwnerNotificationsPage() {
  const router = useRouter();

  const [notifications, setNotifications] =
    useState<OwnerNotification[]>([]);

  const [loading, setLoading] = useState(true);

  const [selectedNotifications, setSelectedNotifications] =
    useState<number[]>([]);

  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadNotifications();
  }, []);

  async function loadNotifications() {
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const {
        data,
        error,
      } = await supabase
        .from("owner_notifications")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        console.error(
          "Load notifications error:",
          error
        );

        alert(
          error.message ||
            "Could not load notifications."
        );

        return;
      }

      setNotifications(
        (data || []) as OwnerNotification[]
      );
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(
    notificationId: number
  ) {
    const {
      error,
    } = await supabase
      .from("owner_notifications")
      .update({
        is_read: true,
      })
      .eq("id", notificationId);

    if (error) {
      console.error(
        "Mark notification read error:",
        error
      );

      alert(
        "Could not mark notification as read."
      );

      return;
    }

    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId
          ? {
              ...notification,
              is_read: true,
            }
          : notification
      )
    );
  }

  async function markAllAsRead() {
    const unreadNotifications =
      notifications.filter(
        (notification) =>
          !notification.is_read
      );

    if (
      unreadNotifications.length === 0
    ) {
      return;
    }

    setProcessing(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const {
        error,
      } = await supabase
        .from("owner_notifications")
        .update({
          is_read: true,
        })
        .eq("owner_id", user.id)
        .eq("is_read", false);

      if (error) {
        console.error(
          "Mark all notifications read error:",
          error
        );

        alert(
          "Could not mark all notifications as read."
        );

        return;
      }

      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          is_read: true,
        }))
      );
    } finally {
      setProcessing(false);
    }
  }

  function toggleNotificationSelection(
    notificationId: number
  ) {
    setSelectedNotifications(
      (current) =>
        current.includes(notificationId)
          ? current.filter(
              (id) =>
                id !== notificationId
            )
          : [
              ...current,
              notificationId,
            ]
    );
  }

  function toggleSelectAll() {
    if (
      notifications.length === 0
    ) {
      return;
    }

    if (
      selectedNotifications.length ===
      notifications.length
    ) {
      setSelectedNotifications([]);
    } else {
      setSelectedNotifications(
        notifications.map(
          (notification) =>
            notification.id
        )
      );
    }
  }

  async function deleteSelected() {
    if (
      selectedNotifications.length === 0
    ) {
      alert(
        "Please select at least one notification."
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Delete ${
          selectedNotifications.length
        } selected notification${
          selectedNotifications.length ===
          1
            ? ""
            : "s"
        }?`
      );

    if (!confirmed) {
      return;
    }

    setProcessing(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const {
        error,
      } = await supabase
        .from("owner_notifications")
        .delete()
        .eq("owner_id", user.id)
        .in(
          "id",
          selectedNotifications
        );

      if (error) {
        console.error(
          "Delete selected notifications error:",
          error
        );

        alert(
          "Could not delete the selected notifications."
        );

        return;
      }

      setNotifications((current) =>
        current.filter(
          (notification) =>
            !selectedNotifications.includes(
              notification.id
            )
        )
      );

      setSelectedNotifications([]);
    } finally {
      setProcessing(false);
    }
  }

  async function deleteAll() {
    if (notifications.length === 0) {
      return;
    }

    const confirmed =
      window.confirm(
        "Delete all notifications?"
      );

    if (!confirmed) {
      return;
    }

    setProcessing(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const {
        error,
      } = await supabase
        .from("owner_notifications")
        .delete()
        .eq("owner_id", user.id);

      if (error) {
        console.error(
          "Delete all notifications error:",
          error
        );

        alert(
          "Could not delete notifications."
        );

        return;
      }

      setNotifications([]);
      setSelectedNotifications([]);
    } finally {
      setProcessing(false);
    }
  }

  const unreadCount =
    notifications.filter(
      (notification) =>
        !notification.is_read
    ).length;

  const allSelected =
    notifications.length > 0 &&
    selectedNotifications.length ===
      notifications.length;

  return (
    <main className="dashboard-page">
      <nav className="dashboard-nav">
        <a
          href="/"
          className="logo"
        >
          STUVANA
        </a>

        <div className="dashboard-nav-actions">
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
          Notifications
        </h1>

        <p>
          Stay updated about new student
          bookings and your properties.
        </p>
      </section>

      <section
        style={{
          width: "100%",
          maxWidth: "1000px",
          margin: "0 auto",
          padding: "0 20px 60px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap",
            marginBottom: "20px",
          }}
        >
          <div>
            <p className="hero-label">
              YOUR UPDATES
            </p>

            <h2>
              {unreadCount > 0
                ? `${unreadCount} unread`
                : "All caught up"}
            </h2>
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            {notifications.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={
                    toggleSelectAll
                  }
                  disabled={processing}
                >
                  {allSelected
                    ? "☐ Deselect All"
                    : "☑ Select All"}
                </button>

                <button
                  type="button"
                  onClick={
                    deleteSelected
                  }
                  disabled={
                    processing ||
                    selectedNotifications.length ===
                      0
                  }
                >
                  🗑 Delete Selected
                </button>

                <button
                  type="button"
                  onClick={deleteAll}
                  disabled={processing}
                >
                  Delete All
                </button>

                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={
                      markAllAsRead
                    }
                    disabled={
                      processing
                    }
                  >
                    Mark All Read
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={
                loadNotifications
              }
              disabled={loading}
            >
              {loading
                ? "Refreshing..."
                : "Refresh"}
            </button>
          </div>
        </div>

        {loading ? (
          <div
            style={{
              padding: "30px",
              borderRadius: "16px",
              background: "#f9fafb",
              border:
                "1px solid #e5e7eb",
              textAlign: "center",
            }}
          >
            <p>
              Loading notifications...
            </p>
          </div>
        ) : notifications.length ===
          0 ? (
          <div className="owner-empty-state">
            <div className="owner-empty-icon">
              🔔
            </div>

            <h3>
              No notifications
            </h3>

            <p>
              New student bookings and
              fully booked properties
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
              display: "grid",
              gap: "14px",
            }}
          >
            {notifications.map(
              (notification) => (
                <article
                  key={notification.id}
                  style={{
                    padding: "20px",
                    borderRadius:
                      "16px",
                    border: notification.is_read
                      ? "1px solid #e5e7eb"
                      : "1px solid #bfdbfe",
                    background:
                      notification.is_read
                        ? "#ffffff"
                        : "#eff6ff",
                    boxShadow:
                      "0 4px 14px rgba(0,0,0,0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems:
                        "flex-start",
                      gap: "14px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedNotifications.includes(
                        notification.id
                      )}
                      onChange={() =>
                        toggleNotificationSelection(
                          notification.id
                        )
                      }
                      style={{
                        marginTop: "5px",
                      }}
                    />

                    <div
                      style={{
                        flex: 1,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent:
                            "space-between",
                          alignItems:
                            "flex-start",
                          gap: "12px",
                        }}
                      >
                        <div>
                          <p
                            className="hero-label"
                            style={{
                              margin: 0,
                            }}
                          >
                            {notification.type ===
                            "property_full"
                              ? "PROPERTY UPDATE"
                              : "BOOKING UPDATE"}
                          </p>

                          <h3
                            style={{
                              marginTop:
                                "5px",
                            }}
                          >
                            {notification.type ===
                            "property_full"
                              ? "🚫 "
                              : "🎉 "}
                            {
                              notification.title
                            }
                          </h3>
                        </div>

                        {!notification.is_read && (
                          <span
                            style={{
                              padding:
                                "5px 9px",
                              borderRadius:
                                "999px",
                              background:
                                "#dbeafe",
                              color:
                                "#1d4ed8",
                              fontSize:
                                "11px",
                              fontWeight:
                                800,
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            NEW
                          </span>
                        )}
                      </div>

                      <p
                        style={{
                          margin:
                            "10px 0 0",
                          fontSize:
                            "15px",
                          lineHeight:
                            1.6,
                          color:
                            "#374151",
                        }}
                      >
                        {
                          notification.message
                        }
                      </p>

                      <div
                        style={{
                          display: "flex",
                          justifyContent:
                            "space-between",
                          alignItems:
                            "center",
                          gap: "10px",
                          flexWrap:
                            "wrap",
                          marginTop:
                            "14px",
                        }}
                      >
                        <span
                          style={{
                            fontSize:
                              "12px",
                            color:
                              "#6b7280",
                          }}
                        >
                          {new Date(
                            notification.created_at
                          ).toLocaleString()}
                        </span>

                        {!notification.is_read && (
                          <button
                            type="button"
                            onClick={() =>
                              markAsRead(
                                notification.id
                              )
                            }
                            disabled={
                              processing
                            }
                            style={{
                              fontSize:
                                "12px",
                              padding:
                                "7px 10px",
                            }}
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              )
            )}
          </div>
        )}
      </section>
    </main>
  );
}