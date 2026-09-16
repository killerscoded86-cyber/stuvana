"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PropertyMedia = {
  id: number;
  property_id: number;
  media_type: "image" | "video";
  storage_path: string;
  public_url: string;
  sort_order: number;
};

type Booking = {
  id: number;
  student_id: string;
  property_id: number;
  owner_id: string;
  amount: number;
  total_amount: number;
  commission_amount?: number | null;
  owner_amount?: number | null;
  payout_id?: number | null;
  status: string;
  paid_at: string | null;
  created_at: string | null;
  paystack_reference: string | null;
  space_reduced?: boolean;
};

type StudentAccommodation = Booking & {
  property: any | null;
  owner: {
    full_name: string | null;
    phone: string | null;
  } | null;
};

type StudentProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
};

type OwnerBooking = Booking & {
  property_name: string;
  student_name: string;
  student_phone: string;
};

type OwnerPayout = {
  id: number;
  owner_id: string;
  amount: number;
  status: string;
  created_at: string | null;
};

type AdminPayout = {
  id: number;
  owner_id: string;
  amount: number;
  currency: string | null;
  recipient_code: string | null;
  payout_method: string | null;
  reference: string | null;
  status: string;
  transfer_code: string | null;
  paystack_transfer_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  owner_name: string;
  business_name: string | null;
  commission_amount: number;
};

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

type AdminUser = {
  id: string;
  full_name: string | null;
  phone: string | null;
  account_type: string;
  university: string | null;
  business_name: string | null;
  created_at: string | null;
  warning_count?: number;
  latest_warning?: {
    reason: string;
    created_at: string;
  } | null;
};

export default function DashboardPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [ownerBookings, setOwnerBookings] =
    useState<OwnerBooking[]>([]);

  const [loadingBookings, setLoadingBookings] =
    useState(false);

  const [ownerPayouts, setOwnerPayouts] =
    useState<OwnerPayout[]>([]);

  const [loadingPayouts, setLoadingPayouts] =
    useState(false);

  const [studentBookings, setStudentBookings] =
    useState<StudentAccommodation[]>([]);

  const [
    loadingStudentBookings,
    setLoadingStudentBookings,
  ] = useState(false);

  const [studentNotifications, setStudentNotifications] =
    useState<StudentNotification[]>([]);

  const [adminProperties, setAdminProperties] =
    useState<any[]>([]);

  const [adminMedia, setAdminMedia] = useState<
    Record<number, PropertyMedia[]>
  >({});

  const [
    loadingAdminProperties,
    setLoadingAdminProperties,
  ] = useState(false);

  const [
    processingPropertyId,
    setProcessingPropertyId,
  ] = useState<number | null>(null);

  const [notifications, setNotifications] =
    useState<OwnerNotification[]>([]);

  /* =========================
     ADMIN USER MANAGEMENT
  ========================= */

  const [students, setStudents] = useState<AdminUser[]>([]);
  const [owners, setOwners] = useState<AdminUser[]>([]);

  const [showStudents, setShowStudents] = useState(false);
  const [showOwners, setShowOwners] = useState(false);

  const [loadingUsers, setLoadingUsers] = useState(false);

  const [processingUserId, setProcessingUserId] =
    useState<string | null>(null);

  /* =========================
     ADMIN PAYOUT MANAGEMENT
  ========================= */

  const [adminPayouts, setAdminPayouts] =
    useState<AdminPayout[]>([]);

  const [loadingAdminPayouts, setLoadingAdminPayouts] =
    useState(false);

  const [adminPayoutError, setAdminPayoutError] =
    useState<string | null>(null);

  const [
    adminCommissionEarned,
    setAdminCommissionEarned,
  ] = useState(0);

  useEffect(() => {
    async function loadDashboard() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const {
        data: profileData,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError || !profileData) {
        console.error("Profile error:", profileError);
        setLoading(false);
        return;
      }

      setProfile(profileData);

      if (profileData.account_type === "owner") {
        const {
          data: propertyData,
          error: propertyError,
        } = await supabase
          .from("properties")
          .select("*")
          .eq("owner_id", user.id)
          .order("created_at", {
            ascending: false,
          });

        if (propertyError) {
          console.error("Properties error:", propertyError);
        }

        setProperties(propertyData || []);

        await loadOwnerBookings(user.id);
        await loadOwnerPayouts(user.id);
        await loadOwnerNotifications(user.id);
      }

      if (profileData.account_type === "student") {
        await loadStudentBookings(user.id);
        await loadStudentNotifications(user.id);
      }

      if (profileData.account_type === "admin") {
        await loadAdminUsers();
        await loadAdminProperties();
        await loadAdminPayouts();
      }

      setLoading(false);
    }

    loadDashboard();
  }, [router]);

  /* =========================
     OWNER FUNCTIONS
  ========================= */

  async function loadOwnerBookings(ownerId: string) {
    setLoadingBookings(true);

    try {
      const {
        data: bookingData,
        error: bookingError,
      } = await supabase
        .from("bookings")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("status", "paid")
        .order("paid_at", {
          ascending: false,
        });

      if (bookingError) {
        console.error(
          "Owner bookings error:",
          bookingError
        );

        setOwnerBookings([]);
        return;
      }

      const bookings = (bookingData || []) as Booking[];

      if (bookings.length === 0) {
        setOwnerBookings([]);
        return;
      }

      const propertyIds = Array.from(
        new Set(
          bookings.map(
            (booking) => booking.property_id
          )
        )
      );

      const {
        data: bookingProperties,
        error: bookingPropertiesError,
      } = await supabase
        .from("properties")
        .select("id, name")
        .in("id", propertyIds);

      if (bookingPropertiesError) {
        console.error(
          "Booking property lookup error:",
          bookingPropertiesError
        );
      }

      const propertyMap = new Map<number, string>();

      (bookingProperties || []).forEach((property) => {
        propertyMap.set(property.id, property.name);
      });

      const studentIds = Array.from(
        new Set(
          bookings.map(
            (booking) => booking.student_id
          )
        )
      );

      const {
        data: studentProfiles,
        error: studentProfilesError,
      } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", studentIds);

      if (studentProfilesError) {
        console.error(
          "Student profile lookup error:",
          studentProfilesError
        );
      }

      const studentMap = new Map<
        string,
        StudentProfile
      >();

      ((studentProfiles || []) as StudentProfile[]).forEach(
        (student) => {
          studentMap.set(student.id, student);
        }
      );

      const bookingDetails = bookings.map((booking) => {
        const student = studentMap.get(
          booking.student_id
        );

        return {
          ...booking,
          property_name:
            propertyMap.get(booking.property_id) ||
            "Property",
          student_name:
            student?.full_name || "Student",
          student_phone:
            student?.phone || "No phone number",
        };
      });

      setOwnerBookings(bookingDetails);
    } finally {
      setLoadingBookings(false);
    }
  }

  async function loadOwnerPayouts(ownerId: string) {
    setLoadingPayouts(true);

    try {
      const {
        data: payoutData,
        error: payoutError,
      } = await supabase
        .from("owner_payouts")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", {
          ascending: false,
        });

      if (payoutError) {
        console.error("Owner payouts error:", payoutError);
        setOwnerPayouts([]);
        return;
      }

      setOwnerPayouts(
        ((payoutData || []) as OwnerPayout[])
      );
    } finally {
      setLoadingPayouts(false);
    }
  }

  async function loadOwnerNotifications(ownerId: string) {
    try {
      const {
        data,
        error,
      } = await supabase
        .from("owner_notifications")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        console.error(
          "Owner notifications error:",
          error
        );

        setNotifications([]);
        return;
      }

      setNotifications(
        (data || []) as OwnerNotification[]
      );
    } catch (error) {
      console.error(
        "Unexpected owner notifications error:",
        error
      );

      setNotifications([]);
    }
  }

  /* =========================
     STUDENT FUNCTIONS
  ========================= */

  async function loadStudentNotifications(studentId: string) {
    try {
      const {
        data,
        error,
      } = await supabase
        .from("student_notifications")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        console.error(
          "Student notifications error:",
          error
        );

        setStudentNotifications([]);
        return;
      }

      setStudentNotifications(
        (data || []) as StudentNotification[]
      );
    } catch (error) {
      console.error(
        "Unexpected student notifications error:",
        error
      );

      setStudentNotifications([]);
    }
  }

  async function loadStudentBookings(studentId: string) {
    setLoadingStudentBookings(true);

    try {
      const {
        data: bookingData,
        error: bookingError,
      } = await supabase
        .from("bookings")
        .select("*")
        .eq("student_id", studentId)
        .eq("status", "paid")
        .order("paid_at", {
          ascending: false,
        });

      if (bookingError) {
        console.error(
          "Student bookings error:",
          bookingError
        );

        setStudentBookings([]);
        return;
      }

      const bookings = (bookingData || []) as Booking[];

      if (bookings.length === 0) {
        setStudentBookings([]);
        return;
      }

      const propertyIds = Array.from(
        new Set(
          bookings.map(
            (booking) => booking.property_id
          )
        )
      );

      const ownerIds = Array.from(
        new Set(
          bookings.map(
            (booking) => booking.owner_id
          )
        )
      );

      const {
        data: propertyData,
        error: propertyError,
      } = await supabase
        .from("properties")
        .select("*")
        .in("id", propertyIds);

      if (propertyError) {
        console.error(
          "Student property lookup error:",
          propertyError
        );
      }

      const {
        data: ownerData,
        error: ownerError,
      } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", ownerIds);

      if (ownerError) {
        console.error(
          "Owner profile lookup error:",
          ownerError
        );
      }

      const propertyMap = new Map<number, any>();

      (propertyData || []).forEach((property) => {
        propertyMap.set(property.id, property);
      });

      const ownerMap = new Map<
        string,
        {
          full_name: string | null;
          phone: string | null;
        }
      >();

      (ownerData || []).forEach((owner) => {
        ownerMap.set(owner.id, {
          full_name: owner.full_name || null,
          phone: owner.phone || null,
        });
      });

      const accommodationDetails = bookings.map(
        (booking) => ({
          ...booking,
          property:
            propertyMap.get(booking.property_id) || null,
          owner:
            ownerMap.get(booking.owner_id) || null,
        })
      );

      setStudentBookings(accommodationDetails);
    } finally {
      setLoadingStudentBookings(false);
    }
  }

  /* =========================
     ADMIN PROPERTY FUNCTIONS
  ========================= */

  async function loadAdminProperties() {
    setLoadingAdminProperties(true);

    try {
      const {
        data: pendingProperties,
        error: propertyError,
      } = await supabase
        .from("properties")
        .select("*")
        .eq("status", "pending")
        .order("created_at", {
          ascending: false,
        });

      if (propertyError) {
        console.error(
          "Admin properties error:",
          propertyError
        );

        alert(
          propertyError.message ||
            "Could not load pending properties."
        );

        return;
      }

      const loadedProperties = pendingProperties || [];

      setAdminProperties(loadedProperties);

      if (loadedProperties.length === 0) {
        setAdminMedia({});
        return;
      }

      const propertyIds = loadedProperties.map(
        (property) => property.id
      );

      const {
        data: mediaData,
        error: mediaError,
      } = await supabase
        .from("property_media")
        .select("*")
        .in("property_id", propertyIds)
        .order("sort_order", {
          ascending: true,
        });

      if (mediaError) {
        console.error(
          "Admin property media error:",
          mediaError
        );

        return;
      }

      const groupedMedia: Record<
        number,
        PropertyMedia[]
      > = {};

      (mediaData || []).forEach((item) => {
        if (!groupedMedia[item.property_id]) {
          groupedMedia[item.property_id] = [];
        }

        groupedMedia[item.property_id].push(item);
      });

      setAdminMedia(groupedMedia);
    } finally {
      setLoadingAdminProperties(false);
    }
  }

  async function updatePropertyStatus(
    propertyId: number,
    status: "approved" | "rejected"
  ) {
    let rejectionReason: string | null = null;

    if (status === "rejected") {
      const reason = window.prompt(
        "Why are you rejecting this property?"
      );

      if (reason === null) {
        return;
      }

      rejectionReason = reason.trim();

      if (!rejectionReason) {
        alert("Please provide a rejection reason.");
        return;
      }
    }

    const confirmed = window.confirm(
      status === "approved"
        ? "Are you sure you want to approve this property?"
        : `Are you sure you want to reject this property?\n\nReason: ${rejectionReason}`
    );

    if (!confirmed) {
      return;
    }

    setProcessingPropertyId(propertyId);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert(
          "Your session has expired. Please log in again."
        );

        router.push("/login");
        return;
      }

      const {
        data: adminProfile,
        error: adminProfileError,
      } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .single();

      if (
        adminProfileError ||
        adminProfile?.account_type !== "admin"
      ) {
        alert(
          "You do not have permission to manage properties."
        );

        return;
      }

      const { error } = await supabase
        .from("properties")
        .update({
          status,
          rejection_reason:
            status === "rejected"
              ? rejectionReason
              : null,
        })
        .eq("id", propertyId);

      if (error) {
        console.error(
          "Update property status error:",
          error
        );

        alert(
          error.message ||
            "Could not update the property status."
        );

        return;
      }

      setAdminProperties((current) =>
        current.filter(
          (property) => property.id !== propertyId
        )
      );

      setAdminMedia((current) => {
        const updated = {
          ...current,
        };

        delete updated[propertyId];

        return updated;
      });

      alert(
        status === "approved"
          ? "Property approved successfully."
          : "Property rejected successfully."
      );
    } finally {
      setProcessingPropertyId(null);
    }
  }

  /* =========================
     ADMIN USER MANAGEMENT
  ========================= */

  async function loadAdminUsers() {
    setLoadingUsers(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        alert(
          "Your session has expired. Please log in again."
        );

        router.push("/login");
        return;
      }

      const response = await fetch(
        "/api/admin/users",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error ||
            "Could not load users."
        );
      }

      setStudents(result.students || []);
      setOwners(result.owners || []);

      return result;
    } catch (error: any) {
      console.error(
        "Admin users error:",
        error
      );

      alert(
        error?.message ||
          "Could not load users."
      );
    } finally {
      setLoadingUsers(false);
    }
  }

  /* =========================
     ADMIN PAYOUT FUNCTIONS
  ========================= */

  async function loadAdminPayouts() {
    setLoadingAdminPayouts(true);
    setAdminPayoutError(null);

    try {
      const {
        data: payoutData,
        error: payoutError,
      } = await supabase
        .from("owner_payouts")
        .select(
          "id, owner_id, amount, currency, recipient_code, payout_method, reference, status, transfer_code, paystack_transfer_id, created_at, updated_at"
        )
        .order("created_at", {
          ascending: false,
        });

      if (payoutError) {
        console.error(
          "Admin payout lookup error:",
          payoutError
        );

        setAdminPayouts([]);
        setAdminPayoutError(
          payoutError.message ||
            "Could not load payout information."
        );
        return;
      }

      const payouts = payoutData || [];

      if (payouts.length === 0) {
        setAdminPayouts([]);
      }

      const ownerIds = Array.from(
        new Set(
          payouts.map(
            (payout) => payout.owner_id
          )
        )
      );

      const {
        data: ownerProfiles,
        error: ownerProfilesError,
      } = ownerIds.length > 0
        ? await supabase
            .from("profiles")
            .select(
              "id, full_name, business_name"
            )
            .in("id", ownerIds)
        : {
            data: [],
            error: null,
          };

      if (ownerProfilesError) {
        console.error(
          "Admin payout owner lookup error:",
          ownerProfilesError
        );
      }

      const ownerMap = new Map<
        string,
        {
          full_name: string | null;
          business_name: string | null;
        }
      >();

      (ownerProfiles || []).forEach((owner) => {
        ownerMap.set(owner.id, {
          full_name: owner.full_name || null,
          business_name:
            owner.business_name || null,
        });
      });

      const {
        data: paidBookings,
        error: commissionError,
      } = await supabase
        .from("bookings")
        .select(
          "id, payout_id, owner_id, commission_amount, status"
        )
        .eq("status", "paid");

      if (commissionError) {
        console.error(
          "Admin commission lookup error:",
          commissionError
        );

        setAdminCommissionEarned(0);
      } else {
        const totalCommission = (
          paidBookings || []
        ).reduce(
          (sum, booking) =>
            sum +
            Number(
              booking.commission_amount || 0
            ),
          0
        );

        setAdminCommissionEarned(
          totalCommission
        );

        const commissionByPayout = new Map<
          number,
          number
        >();

        (paidBookings || []).forEach(
          (booking) => {
            if (booking.payout_id !== null) {
              const payoutId = Number(
                booking.payout_id
              );

              commissionByPayout.set(
                payoutId,
                (commissionByPayout.get(
                  payoutId
                ) || 0) +
                  Number(
                    booking.commission_amount ||
                      0
                  )
              );
            }
          }
        );

        const formattedPayouts: AdminPayout[] =
          payouts.map((payout) => {
            const owner =
              ownerMap.get(
                payout.owner_id
              );

            return {
              ...payout,
              currency:
                payout.currency || "GHS",
              owner_name:
                owner?.full_name ||
                "Property Owner",
              business_name:
                owner?.business_name ||
                null,
              commission_amount:
                commissionByPayout.get(
                  Number(payout.id)
                ) || 0,
            };
          });

        setAdminPayouts(
          formattedPayouts
        );
      }

      if (
        commissionError &&
        payouts.length > 0
      ) {
        const formattedPayouts: AdminPayout[] =
          payouts.map((payout) => {
            const owner =
              ownerMap.get(
                payout.owner_id
              );

            return {
              ...payout,
              currency:
                payout.currency || "GHS",
              owner_name:
                owner?.full_name ||
                "Property Owner",
              business_name:
                owner?.business_name ||
                null,
              commission_amount: 0,
            };
          });

        setAdminPayouts(
          formattedPayouts
        );
      }
    } catch (error: any) {
      console.error(
        "Unexpected admin payout error:",
        error
      );

      setAdminPayouts([]);
      setAdminCommissionEarned(0);
      setAdminPayoutError(
        error?.message ||
          "Could not load payout information."
      );
    } finally {
      setLoadingAdminPayouts(false);
    }
  }

  async function handleViewStudents() {
    setShowOwners(false);

    if (showStudents) {
      setShowStudents(false);
      return;
    }

    if (
      students.length === 0 &&
      owners.length === 0
    ) {
      await loadAdminUsers();
    }

    setShowStudents(true);
  }

  async function handleViewOwners() {
    setShowStudents(false);

    if (showOwners) {
      setShowOwners(false);
      return;
    }

    if (
      students.length === 0 &&
      owners.length === 0
    ) {
      await loadAdminUsers();
    }

    setShowOwners(true);
  }

  async function warnUser(user: AdminUser) {
    const reason = window.prompt(
      `Enter the reason for warning ${
        user.full_name || "this user"
      }:`
    );

    if (reason === null) {
      return;
    }

    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      alert("Please enter a warning reason.");
      return;
    }

    const confirmed = window.confirm(
      `Send a warning to ${
        user.full_name || "this user"
      }?\n\nReason: ${trimmedReason}`
    );

    if (!confirmed) {
      return;
    }

    setProcessingUserId(user.id);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        alert(
          "Your session has expired. Please log in again."
        );

        router.push("/login");
        return;
      }

      const response = await fetch(
        "/api/admin/users",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: "warn",
            userId: user.id,
            reason: trimmedReason,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error ||
            "Could not warn this user."
        );
      }

      alert("User has been warned successfully.");

      await loadAdminUsers();
    } catch (error: any) {
      console.error(
        "Warn user error:",
        error
      );

      alert(
        error?.message ||
          "Could not warn this user."
      );
    } finally {
      setProcessingUserId(null);
    }
  }

  async function deleteUser(user: AdminUser) {
    const confirmed = window.confirm(
      `DELETE ACCOUNT\n\nAre you sure you want to permanently delete ${
        user.full_name || "this user"
      }?\n\nThis action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    const secondConfirmation = window.confirm(
      `Final confirmation:\n\nDelete ${
        user.full_name || "this account"
      } permanently?`
    );

    if (!secondConfirmation) {
      return;
    }

    setProcessingUserId(user.id);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        alert(
          "Your session has expired. Please log in again."
        );

        router.push("/login");
        return;
      }

      const response = await fetch(
        "/api/admin/users",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: "delete",
            userId: user.id,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error ||
            "Could not delete this user."
        );
      }

      alert("User account deleted successfully.");

      setStudents((current) =>
        current.filter(
          (student) => student.id !== user.id
        )
      );

      setOwners((current) =>
        current.filter(
          (owner) => owner.id !== user.id
        )
      );
    } catch (error: any) {
      console.error(
        "Delete user error:",
        error
      );

      alert(
        error?.message ||
          "Could not delete this user."
      );
    } finally {
      setProcessingUserId(null);
    }
  }

  function renderAdminUserCard(user: AdminUser) {
    const isProcessing =
      processingUserId === user.id;

    return (
      <article
        key={user.id}
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "14px",
          padding: "18px",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "20px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>
              {user.full_name ||
                "Unnamed User"}
            </h3>

            <p
              style={{
                margin: "7px 0",
                color: "#666",
              }}
            >
              📞{" "}
              {user.phone ||
                "No phone number"}
            </p>

            {user.account_type ===
              "student" && (
              <p
                style={{
                  margin: "7px 0",
                  color: "#666",
                }}
              >
                🏫{" "}
                {user.university ||
                  "University not specified"}
              </p>
            )}

            {user.account_type ===
              "owner" && (
              <p
                style={{
                  margin: "7px 0",
                  color: "#666",
                }}
              >
                🏢{" "}
                {user.business_name ||
                  "Property Owner"}
              </p>
            )}

            {user.created_at && (
              <p
                style={{
                  margin: "7px 0",
                  fontSize: "13px",
                  color: "#888",
                }}
              >
                Joined:{" "}
                {new Date(
                  user.created_at
                ).toLocaleString()}
              </p>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            {user.warning_count &&
              user.warning_count > 0 && (
                <span
                  style={{
                    padding: "7px 10px",
                    borderRadius: "999px",
                    background: "#fef3c7",
                    color: "#92400e",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  ⚠️ {user.warning_count} warning
                  {user.warning_count > 1
                    ? "s"
                    : ""}
                </span>
              )}
          </div>
        </div>

        {user.latest_warning && (
          <div
            style={{
              marginTop: "14px",
              padding: "12px 14px",
              borderRadius: "10px",
              background: "#fffbeb",
              border: "1px solid #fde68a",
            }}
          >
            <strong
              style={{
                fontSize: "13px",
                color: "#92400e",
              }}
            >
              Latest warning
            </strong>

            <p
              style={{
                margin:
                  "5px 0 0",
                fontSize: "14px",
                color: "#78350f",
              }}
            >
              {user.latest_warning.reason}
            </p>

            <p
              style={{
                margin:
                  "5px 0 0",
                fontSize: "12px",
                color: "#92400e",
              }}
            >
              {new Date(
                user.latest_warning.created_at
              ).toLocaleString()}
            </p>
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            marginTop: "16px",
          }}
        >
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => warnUser(user)}
          >
            ⚠️ Warn User
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={() => deleteUser(user)}
            style={{
              background: "#dc2626",
              color: "#ffffff",
            }}
          >
            {isProcessing
              ? "Processing..."
              : "🗑️ Delete Account"}
          </button>
        </div>
      </article>
    );
  }

  /* =========================
     OWNER DELETE PROPERTY
  ========================= */

  async function deleteProperty(id: number) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this property?"
    );

    if (!confirmed) {
      return;
    }

    const { error } = await supabase
      .from("properties")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(
        "Delete property error:",
        error
      );

      alert("Could not delete this property.");
      return;
    }

    setProperties((current) =>
      current.filter(
        (property) => property.id !== id
      )
    );
  }

  function getPropertyStatus(property: any) {
    const status = String(
      property?.status || "pending"
    ).toLowerCase();

    if (
      status === "approved" ||
      status === "published" ||
      status === "active"
    ) {
      return "approved";
    }

    if (
      status === "rejected" ||
      status === "declined"
    ) {
      return "rejected";
    }

    return "pending";
  }

  function getStatusLabel(property: any) {
    const status = getPropertyStatus(property);

    if (status === "approved") {
      return "Approved";
    }

    if (status === "rejected") {
      return "Rejected";
    }

    return "Pending Approval";
  }

  function getPayoutStatusLabel(status: string) {
    const normalized = String(
      status || ""
    ).toLowerCase();

    if (
      [
        "success",
        "successful",
        "paid",
        "completed",
      ].includes(normalized)
    ) {
      return "Successful";
    }

    if (
      [
        "pending",
        "processing",
        "in_progress",
        "initiated",
      ].includes(normalized)
    ) {
      return "Pending";
    }

    if (
      [
        "failed",
        "reversed",
      ].includes(normalized)
    ) {
      return normalized === "reversed"
        ? "Reversed"
        : "Failed";
    }

    return status || "Unknown";
  }

  function getPayoutStatusStyle(status: string) {
    const normalized = String(
      status || ""
    ).toLowerCase();

    if (
      [
        "success",
        "successful",
        "paid",
        "completed",
      ].includes(normalized)
    ) {
      return {
        background: "#dcfce7",
        color: "#166534",
      };
    }

    if (
      [
        "pending",
        "processing",
        "in_progress",
        "initiated",
      ].includes(normalized)
    ) {
      return {
        background: "#fef3c7",
        color: "#92400e",
      };
    }

    if (
      [
        "failed",
        "reversed",
      ].includes(normalized)
    ) {
      return {
        background: "#fee2e2",
        color: "#991b1b",
      };
    }

    return {
      background: "#f3f4f6",
      color: "#374151",
    };
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) {
    return (
      <main className="dashboard-page">
        <section className="dashboard-header">
          <p className="hero-label">STUVANA</p>

          <h1>Loading dashboard...</h1>
        </section>
      </main>
    );
  }

  /* =========================
     ADMIN DASHBOARD
  ========================= */

  if (profile?.account_type === "admin") {
    const pendingPayouts = adminPayouts
      .filter((payout) => {
        const status = String(
          payout.status || ""
        ).toLowerCase();

        return [
          "pending",
          "processing",
          "in_progress",
          "initiated",
        ].includes(status);
      })
      .reduce(
        (sum, payout) =>
          sum + Number(payout.amount || 0),
        0
      );

    const successfulPayouts = adminPayouts
      .filter((payout) => {
        const status = String(
          payout.status || ""
        ).toLowerCase();

        return [
          "success",
          "successful",
          "paid",
          "completed",
        ].includes(status);
      })
      .reduce(
        (sum, payout) =>
          sum + Number(payout.amount || 0),
        0
      );

    const failedReversedPayouts =
      adminPayouts
        .filter((payout) => {
          const status = String(
            payout.status || ""
          ).toLowerCase();

          return [
            "failed",
            "reversed",
          ].includes(status);
        })
        .reduce(
          (sum, payout) =>
            sum +
            Number(payout.amount || 0),
          0
        );

    return (
      <main className="dashboard-page">
        <nav className="dashboard-nav">
          <a href="/" className="logo">
            STUVANA
          </a>

          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => router.push("/")}
            >
              🏠 Visit STUVANA
            </button>

            <button
              type="button"
              onClick={handleLogout}
            >
              Log Out
            </button>
          </div>
        </nav>

        <section className="dashboard-header">
          <p className="hero-label">
            ADMINISTRATION
          </p>

          <h1>Welcome, STUVANA Admin.</h1>

          {/* =========================
              ADMIN SUMMARY CARDS
          ========================= */}

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "18px",
              marginTop: "30px",
              width: "100%",
              maxWidth: "1200px",
            }}
          >
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "16px",
                padding: "24px",
                textAlign: "left",
                boxShadow:
                  "0 4px 16px rgba(0,0,0,0.05)",
              }}
            >
              <strong
                style={{
                  display: "block",
                  fontSize: "18px",
                  marginBottom: "10px",
                }}
              >
                Students
              </strong>

              <div
                style={{
                  fontSize: "42px",
                  fontWeight: 800,
                  lineHeight: 1,
                }}
              >
                {loadingUsers
                  ? "..."
                  : students.length}
              </div>

              <p
                style={{
                  marginTop: "10px",
                  color: "#666",
                  marginBottom: 0,
                }}
              >
                Registered student accounts
              </p>
            </div>

            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "16px",
                padding: "24px",
                textAlign: "left",
                boxShadow:
                  "0 4px 16px rgba(0,0,0,0.05)",
              }}
            >
              <strong
                style={{
                  display: "block",
                  fontSize: "18px",
                  marginBottom: "10px",
                }}
              >
                Property Owners
              </strong>

              <div
                style={{
                  fontSize: "42px",
                  fontWeight: 800,
                  lineHeight: 1,
                }}
              >
                {loadingUsers
                  ? "..."
                  : owners.length}
              </div>

              <p
                style={{
                  marginTop: "10px",
                  color: "#666",
                  marginBottom: 0,
                }}
              >
                Registered owner accounts
              </p>
            </div>

            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "16px",
                padding: "24px",
                textAlign: "left",
                boxShadow:
                  "0 4px 16px rgba(0,0,0,0.05)",
              }}
            >
              <strong
                style={{
                  display: "block",
                  fontSize: "18px",
                  marginBottom: "10px",
                }}
              >
                Pending Properties
              </strong>

              <div
                style={{
                  fontSize: "42px",
                  fontWeight: 800,
                  lineHeight: 1,
                }}
              >
                {loadingAdminProperties
                  ? "..."
                  : adminProperties.length}
              </div>

              <p
                style={{
                  marginTop: "10px",
                  color: "#666",
                  marginBottom: 0,
                }}
              >
                Awaiting admin review
              </p>
            </div>

            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "16px",
                padding: "24px",
                textAlign: "left",
                boxShadow:
                  "0 4px 16px rgba(0,0,0,0.05)",
              }}
            >
              <strong
                style={{
                  display: "block",
                  fontSize: "18px",
                  marginBottom: "10px",
                }}
              >
                Commission Earned
              </strong>

              <div
                style={{
                  fontSize: "32px",
                  fontWeight: 800,
                  lineHeight: 1.1,
                }}
              >
                {loadingAdminPayouts
                  ? "..."
                  : `GH₵ ${adminCommissionEarned.toLocaleString()}`}
              </div>

              <p
                style={{
                  marginTop: "10px",
                  color: "#666",
                  marginBottom: 0,
                }}
              >
                STUVANA commission from paid bookings
              </p>
            </div>
          </div>
        </section>

        {/* =========================
            USER MANAGEMENT
        ========================= */}

        <section
          style={{
            width: "100%",
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "0 20px 40px",
          }}
        >
          <div
            style={{
              marginBottom: "24px",
            }}
          >
            <p className="hero-label">
              USER MANAGEMENT
            </p>

            <h2>Manage STUVANA Users</h2>

            <p
              style={{
                marginTop: "8px",
                color: "#666",
              }}
            >
              View student and property-owner
              accounts and take administrative
              action when necessary.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "16px",
            }}
          >
            <button
              type="button"
              onClick={handleViewStudents}
              disabled={loadingUsers}
              style={{
                minHeight: "120px",
                borderRadius: "16px",
                padding: "20px",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  fontSize: "34px",
                  marginBottom: "8px",
                }}
              >
                👨‍🎓
              </div>

              <strong
                style={{
                  display: "block",
                  fontSize: "20px",
                }}
              >
                Students
              </strong>

              <span
                style={{
                  display: "block",
                  marginTop: "5px",
                  color: "#666",
                }}
              >
                {students.length} student
                {students.length === 1
                  ? ""
                  : "s"}
              </span>
            </button>

            <button
              type="button"
              onClick={handleViewOwners}
              disabled={loadingUsers}
              style={{
                minHeight: "120px",
                borderRadius: "16px",
                padding: "20px",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  fontSize: "34px",
                  marginBottom: "8px",
                }}
              >
                🏢
              </div>

              <strong
                style={{
                  display: "block",
                  fontSize: "20px",
                }}
              >
                Property Owners
              </strong>

              <span
                style={{
                  display: "block",
                  marginTop: "5px",
                  color: "#666",
                }}
              >
                {owners.length} owner
                {owners.length === 1
                  ? ""
                  : "s"}
              </span>
            </button>
          </div>

          {loadingUsers && (
            <div
              style={{
                marginTop: "20px",
                padding: "20px",
                borderRadius: "14px",
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
              }}
            >
              Loading users...
            </div>
          )}

          {!loadingUsers && showStudents && (
            <div
              style={{
                marginTop: "24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <p className="hero-label">
                    STUDENTS
                  </p>

                  <h2>
                    Student Accounts
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={loadAdminUsers}
                >
                  Refresh Users
                </button>
              </div>

              {students.length === 0 ? (
                <div
                  className="owner-empty-state"
                >
                  <div className="owner-empty-icon">
                    👨‍🎓
                  </div>

                  <h3>
                    No student accounts
                  </h3>

                  <p>
                    Student accounts created
                    on STUVANA will appear
                    here.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gap: "14px",
                  }}
                >
                  {students.map(
                    renderAdminUserCard
                  )}
                </div>
              )}
            </div>
          )}

          {!loadingUsers && showOwners && (
            <div
              style={{
                marginTop: "24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <p className="hero-label">
                    PROPERTY OWNERS
                  </p>

                  <h2>
                    Property Owner Accounts
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={loadAdminUsers}
                >
                  Refresh Users
                </button>
              </div>

              {owners.length === 0 ? (
                <div
                  className="owner-empty-state"
                >
                  <div className="owner-empty-icon">
                    🏢
                  </div>

                  <h3>
                    No property owners
                  </h3>

                  <p>
                    Property-owner accounts
                    created on STUVANA will
                    appear here.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gap: "14px",
                  }}
                >
                  {owners.map(
                    renderAdminUserCard
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* =========================
            ADMIN PAYOUT MANAGEMENT
        ========================= */}

        <section
          style={{
            width: "100%",
            maxWidth: "1200px",
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
              marginBottom: "24px",
            }}
          >
            <div>
              <p className="hero-label">
                FINANCE
              </p>

              <h2>Owner Payout Management</h2>

              <p
                style={{
                  marginTop: "8px",
                  color: "#666",
                }}
              >
                Monitor owner payout requests,
                payout status and STUVANA
                commission.
              </p>
            </div>

            <button
              type="button"
              onClick={loadAdminPayouts}
              disabled={loadingAdminPayouts}
            >
              {loadingAdminPayouts
                ? "Refreshing..."
                : "Refresh Payouts"}
            </button>
          </div>

          {/* PAYOUT SUMMARY */}

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                padding: "22px",
                borderRadius: "18px",
                background: "#ffffff",
                border:
                  "1px solid #e5e7eb",
                boxShadow:
                  "0 8px 24px rgba(15, 23, 42, 0.06)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#6b7280",
                }}
              >
                Payout Requests
              </p>

              <h3
                style={{
                  margin: "8px 0 0",
                  fontSize: "30px",
                }}
              >
                {loadingAdminPayouts
                  ? "..."
                  : adminPayouts.length}
              </h3>

              <p
                style={{
                  margin:
                    "8px 0 0",
                  color: "#666",
                  fontSize: "13px",
                }}
              >
                All payout attempts recorded
              </p>
            </div>

            <div
              style={{
                padding: "22px",
                borderRadius: "18px",
                background: "#ffffff",
                border:
                  "1px solid #e5e7eb",
                boxShadow:
                  "0 8px 24px rgba(15, 23, 42, 0.06)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#6b7280",
                }}
              >
                Pending Payouts
              </p>

              <h3
                style={{
                  margin: "8px 0 0",
                  fontSize: "30px",
                }}
              >
                GH₵{" "}
                {loadingAdminPayouts
                  ? "..."
                  : pendingPayouts.toLocaleString()}
              </h3>

              <p
                style={{
                  margin:
                    "8px 0 0",
                  color: "#666",
                  fontSize: "13px",
                }}
              >
                Awaiting completion
              </p>
            </div>

            <div
              style={{
                padding: "22px",
                borderRadius: "18px",
                background: "#ffffff",
                border:
                  "1px solid #e5e7eb",
                boxShadow:
                  "0 8px 24px rgba(15, 23, 42, 0.06)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#6b7280",
                }}
              >
                Successful Payouts
              </p>

              <h3
                style={{
                  margin: "8px 0 0",
                  fontSize: "30px",
                }}
              >
                GH₵{" "}
                {loadingAdminPayouts
                  ? "..."
                  : successfulPayouts.toLocaleString()}
              </h3>

              <p
                style={{
                  margin:
                    "8px 0 0",
                  color: "#666",
                  fontSize: "13px",
                }}
              >
                Successfully paid to owners
              </p>
            </div>

            <div
              style={{
                padding: "22px",
                borderRadius: "18px",
                background: "#ffffff",
                border:
                  "1px solid #e5e7eb",
                boxShadow:
                  "0 8px 24px rgba(15, 23, 42, 0.06)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#6b7280",
                }}
              >
                Failed / Reversed
              </p>

              <h3
                style={{
                  margin: "8px 0 0",
                  fontSize: "30px",
                }}
              >
                GH₵{" "}
                {loadingAdminPayouts
                  ? "..."
                  : failedReversedPayouts.toLocaleString()}
              </h3>

              <p
                style={{
                  margin:
                    "8px 0 0",
                  color: "#666",
                  fontSize: "13px",
                }}
              >
                Unsuccessful payout attempts
              </p>
            </div>

            <div
              style={{
                padding: "22px",
                borderRadius: "18px",
                background: "#ffffff",
                border:
                  "1px solid #e5e7eb",
                boxShadow:
                  "0 8px 24px rgba(15, 23, 42, 0.06)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#6b7280",
                }}
              >
                Commission Earned
              </p>

              <h3
                style={{
                  margin: "8px 0 0",
                  fontSize: "30px",
                }}
              >
                GH₵{" "}
                {loadingAdminPayouts
                  ? "..."
                  : adminCommissionEarned.toLocaleString()}
              </h3>

              <p
                style={{
                  margin:
                    "8px 0 0",
                  color: "#666",
                  fontSize: "13px",
                }}
              >
                From all paid bookings
              </p>
            </div>
          </div>

          {adminPayoutError && (
            <div
              style={{
                marginBottom: "20px",
                padding: "16px",
                borderRadius: "12px",
                background: "#fef2f2",
                border:
                  "1px solid #fecaca",
                color: "#991b1b",
              }}
            >
              ⚠️ {adminPayoutError}
            </div>
          )}

          {loadingAdminPayouts ? (
            <div
              style={{
                padding: "24px",
                borderRadius: "16px",
                background: "#f9fafb",
                border:
                  "1px solid #e5e7eb",
              }}
            >
              Loading payout information...
            </div>
          ) : adminPayouts.length === 0 ? (
            <div className="owner-empty-state">
              <div className="owner-empty-icon">
                💰
              </div>

              <h3>
                No payout requests yet
              </h3>

              <p>
                Owner payout activity will
                appear here once payout
                requests are created.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "16px",
              }}
            >
              {adminPayouts.map(
                (payout) => {
                  const statusStyle =
                    getPayoutStatusStyle(
                      payout.status
                    );

                  return (
                    <article
                      key={payout.id}
                      style={{
                        background:
                          "#ffffff",
                        border:
                          "1px solid #e5e7eb",
                        borderRadius:
                          "16px",
                        padding:
                          "20px",
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
                          gap: "20px",
                          flexWrap:
                            "wrap",
                        }}
                      >
                        <div>
                          <p
                            className="hero-label"
                            style={{
                              margin: 0,
                            }}
                          >
                            PAYOUT #{payout.id}
                          </p>

                          <h3
                            style={{
                              marginTop:
                                "6px",
                            }}
                          >
                            {payout.owner_name}
                          </h3>

                          {payout.business_name && (
                            <p
                              style={{
                                margin:
                                  "5px 0",
                                color:
                                  "#666",
                              }}
                            >
                              🏢{" "}
                              {
                                payout.business_name
                              }
                            </p>
                          )}

                          {payout.created_at && (
                            <p
                              style={{
                                margin:
                                  "5px 0",
                                fontSize:
                                  "13px",
                                color:
                                  "#888",
                              }}
                            >
                              Created:{" "}
                              {new Date(
                                payout.created_at
                              ).toLocaleString()}
                            </p>
                          )}
                        </div>

                        <span
                          style={{
                            padding:
                              "8px 12px",
                            borderRadius:
                              "999px",
                            fontSize:
                              "12px",
                            fontWeight:
                              800,
                            ...statusStyle,
                          }}
                        >
                          {getPayoutStatusLabel(
                            payout.status
                          )}
                        </span>
                      </div>

                      <div
                        style={{
                          display:
                            "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: "12px",
                          marginTop:
                            "20px",
                        }}
                      >
                        <div
                          style={{
                            padding:
                              "14px",
                            borderRadius:
                              "12px",
                            background:
                              "#f9fafb",
                          }}
                        >
                          <span
                            style={{
                              display:
                                "block",
                              fontSize:
                                "12px",
                              color:
                                "#6b7280",
                              marginBottom:
                                "5px",
                            }}
                          >
                            Payout Amount
                          </span>

                          <strong
                            style={{
                              fontSize:
                                "19px",
                            }}
                          >
                            GH₵{" "}
                            {Number(
                              payout.amount ||
                                0
                            ).toLocaleString()}
                          </strong>
                        </div>

                        <div
                          style={{
                            padding:
                              "14px",
                            borderRadius:
                              "12px",
                            background:
                              "#f9fafb",
                          }}
                        >
                          <span
                            style={{
                              display:
                                "block",
                              fontSize:
                                "12px",
                              color:
                                "#6b7280",
                              marginBottom:
                                "5px",
                            }}
                          >
                            STUVANA Commission
                          </span>

                          <strong
                            style={{
                              fontSize:
                                "19px",
                            }}
                          >
                            GH₵{" "}
                            {payout.commission_amount.toLocaleString()}
                          </strong>
                        </div>

                        <div
                          style={{
                            padding:
                              "14px",
                            borderRadius:
                              "12px",
                            background:
                              "#f9fafb",
                          }}
                        >
                          <span
                            style={{
                              display:
                                "block",
                              fontSize:
                                "12px",
                              color:
                                "#6b7280",
                              marginBottom:
                                "5px",
                            }}
                          >
                            Payout Method
                          </span>

                          <strong>
                            {payout.payout_method ||
                              "Not specified"}
                          </strong>
                        </div>

                        <div
                          style={{
                            padding:
                              "14px",
                            borderRadius:
                              "12px",
                            background:
                              "#f9fafb",
                          }}
                        >
                          <span
                            style={{
                              display:
                                "block",
                              fontSize:
                                "12px",
                              color:
                                "#6b7280",
                              marginBottom:
                                "5px",
                            }}
                          >
                            Currency
                          </span>

                          <strong>
                            {payout.currency ||
                              "GHS"}
                          </strong>
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop:
                            "18px",
                          padding:
                            "14px",
                          borderRadius:
                            "12px",
                          background:
                            "#f9fafb",
                          border:
                            "1px solid #e5e7eb",
                        }}
                      >
                        <div
                          style={{
                            display:
                              "grid",
                            gap: "8px",
                          }}
                        >
                          <p
                            style={{
                              margin: 0,
                              fontSize:
                                "13px",
                            }}
                          >
                            <strong>
                              Reference:
                            </strong>{" "}
                            {payout.reference ||
                              "Not available"}
                          </p>

                          <p
                            style={{
                              margin: 0,
                              fontSize:
                                "13px",
                            }}
                          >
                            <strong>
                              Transfer Code:
                            </strong>{" "}
                            {payout.transfer_code ||
                              "Not available"}
                          </p>

                          <p
                            style={{
                              margin: 0,
                              fontSize:
                                "13px",
                            }}
                          >
                            <strong>
                              Paystack Transfer ID:
                            </strong>{" "}
                            {payout.paystack_transfer_id ||
                              "Not available"}
                          </p>
                        </div>
                      </div>

                      {payout.commission_amount ===
                        0 &&
                        [
                          "failed",
                          "reversed",
                        ].includes(
                          String(
                            payout.status
                          ).toLowerCase()
                        ) && (
                          <p
                            style={{
                              marginTop:
                                "12px",
                              fontSize:
                                "12px",
                              color:
                                "#777",
                            }}
                          >
                            Commission for this
                            specific payout cannot
                            be reconstructed from
                            the current payout record
                            because failed/reversed
                            payout bookings are released
                            back to an available
                            state.
                          </p>
                        )}
                    </article>
                  );
                }
              )}
            </div>
          )}

          <div
            style={{
              marginTop: "20px",
              padding: "16px 18px",
              borderRadius: "12px",
              background: "#eff6ff",
              border:
                "1px solid #bfdbfe",
              color: "#1e40af",
              fontSize: "13px",
              lineHeight: 1.6,
            }}
          >
            <strong>
              Commission calculation:
            </strong>{" "}
            STUVANA commission earned is calculated
            from the <code>commission_amount</code>{" "}
            stored on paid bookings. It is separate
            from the amount paid out to property owners.
          </div>
        </section>

        {/* =========================
            PROPERTY MANAGEMENT
        ========================= */}

        <section
          style={{
            width: "100%",
            maxWidth: "1200px",
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
              marginBottom: "24px",
            }}
          >
            <div>
              <p className="hero-label">
                PROPERTY REVIEW
              </p>

              <h2>Pending Properties</h2>

              <p
                style={{
                  marginTop: "8px",
                  color: "#666",
                }}
              >
                Review owner submissions
                before they appear publicly
                on STUVANA.
              </p>
            </div>

            <button
              type="button"
              onClick={loadAdminProperties}
              disabled={
                loadingAdminProperties
              }
            >
              {loadingAdminProperties
                ? "Refreshing..."
                : "Refresh"}
            </button>
          </div>

          {loadingAdminProperties ? (
            <p>
              Loading pending properties...
            </p>
          ) : adminProperties.length ===
            0 ? (
            <div className="owner-empty-state">
              <div className="owner-empty-icon">
                ✅
              </div>

              <h3>
                No pending properties
              </h3>

              <p>
                New owner submissions will
                appear here for review.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "24px",
              }}
            >
              {adminProperties.map(
                (property) => {
                  const media =
                    adminMedia[property.id] ||
                    [];

                  const images =
                    media.filter(
                      (item) =>
                        item.media_type ===
                        "image"
                    );

                  const videos =
                    media.filter(
                      (item) =>
                        item.media_type ===
                        "video"
                    );

                  const coverImage =
                    images.find(
                      (image) =>
                        image.public_url ===
                        property.image_url
                    ) || images[0];

                  const hasCoordinates =
                    typeof property.latitude ===
                      "number" &&
                    typeof property.longitude ===
                      "number";

                  const mapUrl =
                    hasCoordinates
                      ? `https://www.openstreetmap.org/export/embed.html?bbox=${property.longitude - 0.005}%2C${property.latitude - 0.005}%2C${property.longitude + 0.005}%2C${property.latitude + 0.005}&layer=mapnik&marker=${property.latitude}%2C${property.longitude}`
                      : null;

                  const isProcessing =
                    processingPropertyId ===
                    property.id;

                  return (
                    <article
                      key={property.id}
                      style={{
                        border:
                          "1px solid #e5e7eb",
                        borderRadius: "16px",
                        padding: "20px",
                        background:
                          "#ffffff",
                        boxShadow:
                          "0 4px 16px rgba(0,0,0,0.05)",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "minmax(260px, 380px) 1fr",
                          gap: "24px",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              width: "100%",
                              aspectRatio:
                                "4 / 3",
                              borderRadius:
                                "12px",
                              overflow:
                                "hidden",
                              background:
                                "#f3f4f6",
                            }}
                          >
                            {coverImage ? (
                              <img
                                src={
                                  coverImage.public_url
                                }
                                alt={
                                  property.name
                                }
                                style={{
                                  width:
                                    "100%",
                                  height:
                                    "100%",
                                  objectFit:
                                    "cover",
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width:
                                    "100%",
                                  height:
                                    "100%",
                                  display:
                                    "flex",
                                  alignItems:
                                    "center",
                                  justifyContent:
                                    "center",
                                  fontSize:
                                    "48px",
                                }}
                              >
                                🏠
                              </div>
                            )}
                          </div>

                          {images.length >
                            0 && (
                            <div
                              style={{
                                display:
                                  "grid",
                                gridTemplateColumns:
                                  "repeat(3, 1fr)",
                                gap: "8px",
                                marginTop:
                                  "10px",
                              }}
                            >
                              {images.map(
                                (image) => (
                                  <img
                                    key={
                                      image.id
                                    }
                                    src={
                                      image.public_url
                                    }
                                    alt={
                                      property.name
                                    }
                                    style={{
                                      width:
                                        "100%",
                                      aspectRatio:
                                        "1",
                                      objectFit:
                                        "cover",
                                      borderRadius:
                                        "8px",
                                    }}
                                  />
                                )
                              )}
                            </div>
                          )}

                          {videos.length >
                            0 && (
                            <p
                              style={{
                                marginTop:
                                  "12px",
                                fontSize:
                                  "14px",
                              }}
                            >
                              🎥{" "}
                              {
                                videos.length
                              }{" "}
                              video
                              {videos.length >
                              1
                                ? "s"
                                : ""}{" "}
                              submitted
                            </p>
                          )}
                        </div>

                        <div>
                          <p
                            style={{
                              margin: 0,
                              fontSize:
                                "13px",
                              fontWeight: 700,
                              color:
                                "#92400e",
                              textTransform:
                                "uppercase",
                            }}
                          >
                            Pending Approval
                          </p>

                          <h3
                            style={{
                              marginTop:
                                "8px",
                            }}
                          >
                            {property.name}
                          </h3>

                          <p>
                            📍{" "}
                            {
                              property.location
                            }
                          </p>

                          <p>
                            🏫{" "}
                            {property.university ||
                              "University not specified"}
                          </p>

                          <div
                            style={{
                              display:
                                "flex",
                              gap: "12px",
                              flexWrap:
                                "wrap",
                              margin:
                                "12px 0",
                            }}
                          >
                            <span>
                              🏠{" "}
                              {
                                property.room_type
                              }
                            </span>

                            <span>
                              👥{" "}
                              {
                                property.spaces
                              }{" "}
                              spaces
                            </span>

                            <span>
                              💰 GH₵{" "}
                              {Number(
                                property.price
                              ).toLocaleString()}{" "}
                              {
                                property.period
                              }
                            </span>
                          </div>

                          {property.walking_minutes && (
                            <p>
                              🚶{" "}
                              {
                                property.walking_minutes
                              }{" "}
                              mins walk to
                              campus
                            </p>
                          )}

                          {property.description && (
                            <div
                              style={{
                                marginTop:
                                  "16px",
                              }}
                            >
                              <strong>
                                Description
                              </strong>

                              <p>
                                {
                                  property.description
                                }
                              </p>
                            </div>
                          )}

                          {mapUrl && (
                            <div
                              style={{
                                marginTop:
                                  "20px",
                              }}
                            >
                              <strong>
                                Property
                                Location
                              </strong>

                              <p
                                style={{
                                  fontSize:
                                    "13px",
                                  color:
                                    "#666",
                                  margin:
                                    "6px 0 10px",
                                }}
                              >
                                Precise
                                location
                                supplied by
                                the owner.
                              </p>

                              <div
                                style={{
                                  width:
                                    "100%",
                                  overflow:
                                    "hidden",
                                  border:
                                    "1px solid #e5e7eb",
                                  borderRadius:
                                    "12px",
                                }}
                              >
                                <iframe
                                  title={`Location of ${property.name}`}
                                  src={
                                    mapUrl
                                  }
                                  style={{
                                    width:
                                      "100%",
                                    height:
                                      "280px",
                                    border: 0,
                                    display:
                                      "block",
                                  }}
                                  loading="lazy"
                                />
                              </div>

                              <p
                                style={{
                                  marginTop:
                                    "8px",
                                  fontSize:
                                    "12px",
                                  color:
                                    "#777",
                                }}
                              >
                                📍{" "}
                                {property.latitude.toFixed(
                                  6
                                )}
                                ,{" "}
                                {property.longitude.toFixed(
                                  6
                                )}
                              </p>
                            </div>
                          )}

                          {!mapUrl && (
                            <p
                              style={{
                                marginTop:
                                  "18px",
                                color:
                                  "#92400e",
                                fontSize:
                                  "14px",
                              }}
                            >
                              ⚠️ No precise
                              property
                              location was
                              submitted.
                            </p>
                          )}

                          <div
                            style={{
                              display:
                                "flex",
                              gap: "12px",
                              flexWrap:
                                "wrap",
                              marginTop:
                                "24px",
                            }}
                          >
                            <button
                              type="button"
                              disabled={
                                isProcessing
                              }
                              onClick={() =>
                                updatePropertyStatus(
                                  property.id,
                                  "approved"
                                )
                              }
                            >
                              {isProcessing
                                ? "Processing..."
                                : "✓ Approve Property"}
                            </button>

                            <button
                              type="button"
                              disabled={
                                isProcessing
                              }
                              onClick={() =>
                                updatePropertyStatus(
                                  property.id,
                                  "rejected"
                                )
                              }
                            >
                              {isProcessing
                                ? "Processing..."
                                : "✕ Reject Property"}
                            </button>

                            <button
                              type="button"
                              disabled={
                                isProcessing
                              }
                              onClick={() =>
                                router.push(
                                  `/property/${property.id}`
                                )
                              }
                            >
                              View Property
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                }
              )}
            </div>
          )}
        </section>
      </main>
    );
  }

  /* =========================
     OWNER DASHBOARD
  ========================= */

  if (profile?.account_type === "owner") {
    const unreadCount =
      notifications.filter(
        (notification) =>
          !notification.is_read
      ).length;

    const totalEarnings = ownerBookings.reduce(
      (sum, booking) =>
        sum + Number(booking.amount || 0),
      0
    );

    const pendingPayouts = ownerPayouts
      .filter((payout) => {
        const status = String(
          payout.status || ""
        ).toLowerCase();

        return [
          "pending",
          "processing",
          "in_progress",
          "initiated",
        ].includes(status);
      })
      .reduce(
        (sum, payout) =>
          sum + Number(payout.amount || 0),
        0
      );

    const completedPayouts = ownerPayouts
      .filter((payout) => {
        const status = String(
          payout.status || ""
        ).toLowerCase();

        return [
          "success",
          "successful",
          "paid",
          "completed",
        ].includes(status);
      })
      .reduce(
        (sum, payout) =>
          sum + Number(payout.amount || 0),
        0
      );

    const availableBalance = Math.max(
      0,
      totalEarnings -
        completedPayouts -
        pendingPayouts
    );

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
            }}
          >
            <button
              type="button"
              aria-label="Notifications"
              onClick={() =>
                router.push(
                  "/owner/notifications"
                )
              }
              style={{
                position: "relative",
                width: "46px",
                height: "46px",
                padding: 0,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "21px",
                cursor: "pointer",
              }}
            >
              🔔

              {unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: "-3px",
                    right: "-3px",
                    minWidth: "20px",
                    height: "20px",
                    padding: "0 5px",
                    borderRadius: "999px",
                    background: "#dc2626",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "11px",
                    fontWeight: 800,
                    border:
                      "2px solid #ffffff",
                  }}
                >
                  {unreadCount > 99
                    ? "99+"
                    : unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => router.push("/")}
            >
              Home
            </button>

            <button
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
            Welcome,{" "}
            {profile?.full_name ||
              "Property Owner"}
          </h1>

          <p>
            Manage your student accommodation
            listings from one place.
          </p>

          <div
            className="owner-dashboard-actions"
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              marginTop: "24px",
            }}
          >
            <a
              href="/owner/add-property"
              className="details-primary-button"
              style={{
                cursor: "pointer",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent:
                  "center",
              }}
            >
              + Add Property
            </a>

            <button
              type="button"
              className="details-secondary-button"
              onClick={() =>
                router.push(
                  "/owner/students"
                )
              }
            >
              👨‍🎓 View Students
            </button>

            <button
              type="button"
              className="details-secondary-button"
              onClick={() =>
                router.push(
                  "/owner/payout"
                )
              }
            >
              💰 Withdraw Earnings
            </button>

            <button
              type="button"
              className="details-secondary-button"
              onClick={() =>
                router.push(
                  "/owner/payout-history"
                )
              }
            >
              📋 Payout History
            </button>

            <button
              type="button"
              className="details-secondary-button"
              onClick={() =>
                router.push(
                  "/owner/payout-account"
                )
              }
            >
              💳 Payout Account
            </button>
          </div>
        </section>

        <section
          className="owner-properties-section"
          style={{ marginTop: "24px" }}
        >
          <div className="owner-section-heading">
            <div>
              <p className="hero-label">
                EARNINGS
              </p>

              <h2>Owner Earnings</h2>
            </div>

            <span>
              {loadingBookings || loadingPayouts
                ? "Updating..."
                : `${ownerBookings.length} paid ${ownerBookings.length === 1 ? "booking" : "bookings"}`}
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "16px",
            }}
          >
            <div
              style={{
                padding: "22px",
                borderRadius: "18px",
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                boxShadow:
                  "0 8px 24px rgba(15, 23, 42, 0.06)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#6b7280",
                }}
              >
                Total earnings
              </p>

              <h3
                style={{
                  margin: "8px 0 0",
                  fontSize: "28px",
                }}
              >
                GH₵{" "}
                {totalEarnings.toLocaleString()}
              </h3>
            </div>

            <div
              style={{
                padding: "22px",
                borderRadius: "18px",
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                boxShadow:
                  "0 8px 24px rgba(15, 23, 42, 0.06)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#6b7280",
                }}
              >
                Pending earnings
              </p>

              <h3
                style={{
                  margin: "8px 0 0",
                  fontSize: "28px",
                }}
              >
                GH₵{" "}
                {pendingPayouts.toLocaleString()}
              </h3>
            </div>

            <div
              style={{
                padding: "22px",
                borderRadius: "18px",
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                boxShadow:
                  "0 8px 24px rgba(15, 23, 42, 0.06)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#6b7280",
                }}
              >
                Available balance
              </p>

              <h3
                style={{
                  margin: "8px 0 0",
                  fontSize: "28px",
                }}
              >
                GH₵{" "}
                {availableBalance.toLocaleString()}
              </h3>
            </div>

            <div
              style={{
                padding: "22px",
                borderRadius: "18px",
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                boxShadow:
                  "0 8px 24px rgba(15, 23, 42, 0.06)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#6b7280",
                }}
              >
                Paid bookings
              </p>

              <h3
                style={{
                  margin: "8px 0 0",
                  fontSize: "28px",
                }}
              >
                {ownerBookings.length}
              </h3>
            </div>
          </div>
        </section>

        <section className="owner-properties-section">
          <div className="owner-section-heading">
            <div>
              <p className="hero-label">
                MY LISTINGS
              </p>

              <h2>Your Properties</h2>
            </div>

            <span>
              {properties.length}{" "}
              {properties.length === 1
                ? "property"
                : "properties"}
            </span>
          </div>

          {properties.length === 0 ? (
            <div className="owner-empty-state">
              <div className="owner-empty-icon">
                🏠
              </div>

              <h3>No properties yet</h3>

              <p>
                You haven't added any
                accommodation listings yet.
              </p>

              <a
                href="/owner/add-property"
                className="details-primary-button"
                style={{
                  cursor: "pointer",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent:
                    "center",
                }}
              >
                + Add Your First Property
              </a>
            </div>
          ) : (
            <div className="owner-properties-grid">
              {properties.map((property) => {
                const status =
                  getPropertyStatus(
                    property
                  );

                const statusLabel =
                  getStatusLabel(
                    property
                  );

                const spaces = Number(
                  property.spaces
                );

                const isUnavailable =
                  Number.isFinite(spaces) &&
                  spaces <= 0;

                return (
                  <article
                    className="owner-property-card"
                    key={property.id}
                  >
                    <div className="owner-property-image">
                      {property.image_url ? (
                        <img
                          src={
                            property.image_url
                          }
                          alt={property.name}
                        />
                      ) : (
                        <div className="owner-property-placeholder">
                          🏠
                        </div>
                      )}

                      <div
                        style={{
                          position:
                            "absolute",
                          top: "12px",
                          right: "12px",
                          padding:
                            "7px 11px",
                          borderRadius:
                            "999px",
                          background:
                            status ===
                            "approved"
                              ? "#dcfce7"
                              : status ===
                                "rejected"
                              ? "#fee2e2"
                              : "#fef3c7",
                          color:
                            status ===
                            "approved"
                              ? "#166534"
                              : status ===
                                "rejected"
                              ? "#991b1b"
                              : "#92400e",
                          fontSize:
                            "12px",
                          fontWeight: 700,
                          lineHeight: 1,
                          zIndex: 2,
                        }}
                      >
                        {statusLabel}
                      </div>
                    </div>

                    <div className="owner-property-content">
                      <p className="owner-property-location">
                        📍{" "}
                        {
                          property.location
                        }
                      </p>

                      <h3>
                        {property.name}
                      </h3>

                      <p className="owner-property-price">
                        GH₵{" "}
                        {Number(
                          property.price
                        ).toLocaleString()}
                        <span>
                          {" "}
                          {
                            property.period
                          }
                        </span>
                      </p>

                      <div className="owner-property-info">
                        <span>
                          🏠{" "}
                          {
                            property.room_type
                          }
                        </span>

                        <span>
                          👥{" "}
                          {Number.isFinite(
                            spaces
                          )
                            ? spaces
                            : 0}{" "}
                          spaces
                        </span>
                      </div>

                      {isUnavailable && (
                        <div
                          style={{
                            marginTop:
                              "12px",
                            padding:
                              "12px 14px",
                            borderRadius:
                              "10px",
                            background:
                              "#fef2f2",
                            border:
                              "1px solid #fecaca",
                          }}
                        >
                          <p
                            style={{
                              margin: 0,
                              fontSize:
                                "14px",
                              lineHeight:
                                1.5,
                              fontWeight: 700,
                              color:
                                "#991b1b",
                            }}
                          >
                            🚫 Room
                            unavailable
                            at the
                            moment.
                          </p>
                        </div>
                      )}

                      {property.walking_minutes && (
                        <p className="walking-distance">
                          🚶{" "}
                          {
                            property.walking_minutes
                          }{" "}
                          mins walk to
                          campus
                        </p>
                      )}

                      {status ===
                        "pending" && (
                        <div
                          style={{
                            marginTop:
                              "12px",
                            padding:
                              "12px 14px",
                            borderRadius:
                              "10px",
                            background:
                              "#fffbeb",
                            border:
                              "1px solid #fde68a",
                          }}
                        >
                          <p
                            style={{
                              margin: 0,
                              fontSize:
                                "14px",
                              lineHeight:
                                1.5,
                              color:
                                "#92400e",
                            }}
                          >
                            ⏳ Your
                            property
                            has been
                            submitted
                            and is
                            waiting
                            for admin
                            approval.
                          </p>
                        </div>
                      )}

                      {status ===
                        "rejected" && (
                        <div
                          style={{
                            marginTop:
                              "12px",
                            padding:
                              "14px",
                            borderRadius:
                              "10px",
                            background:
                              "#fef2f2",
                            border:
                              "1px solid #fecaca",
                          }}
                        >
                          <p
                            style={{
                              margin: 0,
                              fontSize:
                                "13px",
                              fontWeight: 700,
                              color:
                                "#991b1b",
                              textTransform:
                                "uppercase",
                            }}
                          >
                            ❌ Rejected
                          </p>

                          <p
                            style={{
                              margin:
                                "6px 0 0",
                              fontSize:
                                "14px",
                              lineHeight:
                                1.5,
                              color:
                                "#7f1d1d",
                            }}
                          >
                            {property.rejection_reason ||
                              "No rejection reason was provided. Please review your listing and update it."}
                          </p>
                        </div>
                      )}

                      {status ===
                        "approved" &&
                        !isUnavailable && (
                          <div
                            style={{
                              marginTop:
                                "12px",
                              padding:
                                "12px 14px",
                              borderRadius:
                                "10px",
                              background:
                                "#f0fdf4",
                              border:
                                "1px solid #bbf7d0",
                            }}
                          >
                            <p
                              style={{
                                margin: 0,
                                fontSize:
                                  "14px",
                                lineHeight:
                                  1.5,
                                color:
                                  "#166534",
                              }}
                            >
                              ✓ Your
                              property
                              has been
                              approved
                              and is
                              available
                              to students.
                            </p>
                          </div>
                        )}

                      {status ===
                        "approved" &&
                        isUnavailable && (
                          <div
                            style={{
                              marginTop:
                                "12px",
                              padding:
                                "12px 14px",
                              borderRadius:
                                "10px",
                              background:
                                "#f3f4f6",
                              border:
                                "1px solid #d1d5db",
                            }}
                          >
                            <p
                              style={{
                                margin: 0,
                                fontSize:
                                  "14px",
                                lineHeight:
                                  1.5,
                                color:
                                  "#374151",
                              }}
                            >
                              ✓ All
                              available
                              spaces
                              have been
                              booked.
                            </p>
                          </div>
                        )}

                      <div className="owner-property-actions">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/property/${property.id}`
                            )
                          }
                        >
                          View
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/owner/edit-property/${property.id}`
                            )
                          }
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="delete-property-button"
                          onClick={() =>
                            deleteProperty(
                              property.id
                            )
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    );
  }

  /* =========================
     STUDENT DASHBOARD
  ========================= */

  const studentUnreadCount =
    studentNotifications.filter(
      (notification) =>
        !notification.is_read
    ).length;

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
          }}
        >
          <button
            type="button"
            aria-label="Notifications"
            onClick={() =>
              router.push("/notifications")
            }
            style={{
              position: "relative",
              width: "46px",
              height: "46px",
              padding: 0,
              borderRadius: "50%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "21px",
              cursor: "pointer",
            }}
          >
            🔔

            {studentUnreadCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: "-3px",
                  right: "-3px",
                  minWidth: "20px",
                  height: "20px",
                  padding: "0 5px",
                  borderRadius: "999px",
                  background: "#dc2626",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 800,
                  border:
                    "2px solid #ffffff",
                }}
              >
                {studentUnreadCount > 99
                  ? "99+"
                  : studentUnreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => router.push("/")}
          >
            Home
          </button>

          <button
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
          STUDENT ACCOUNT
        </p>

        <h1>
          Welcome,{" "}
          {profile?.full_name ||
            "Student"}
        </h1>

        <p>
          Find and save student accommodation
          that works for you.
        </p>

        <div className="owner-dashboard-actions">
          <button
            className="details-primary-button"
            onClick={() =>
              router.push("/saved")
            }
          >
            View Saved Properties
          </button>

          <button
            className="details-secondary-button"
            onClick={() =>
              router.push("/")
            }
          >
            Find Housing
          </button>
        </div>
      </section>

      <section
        style={{
          width: "100%",
          maxWidth: "1200px",
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
              MY ACCOMMODATION
            </p>

            <h2>
              Confirmed Booking
            </h2>

            <p
              style={{
                marginTop: "8px",
                color: "#666",
              }}
            >
              Your successfully paid
              accommodation allocations
              appear here.
            </p>
          </div>

          <button
            type="button"
            onClick={async () => {
              const {
                data: { user },
              } =
                await supabase.auth.getUser();

              if (user) {
                await loadStudentBookings(
                  user.id
                );

                await loadStudentNotifications(
                  user.id
                );
              }
            }}
            disabled={
              loadingStudentBookings
            }
          >
            {loadingStudentBookings
              ? "Refreshing..."
              : "Refresh"}
          </button>
        </div>

        {loadingStudentBookings ? (
          <div
            style={{
              padding: "24px",
              borderRadius: "16px",
              background: "#f9fafb",
              border:
                "1px solid #e5e7eb",
            }}
          >
            <p>
              Loading your
              accommodation...
            </p>
          </div>
        ) : studentBookings.length ===
          0 ? (
          <div className="owner-empty-state">
            <div className="owner-empty-icon">
              🏠
            </div>

            <h3>
              No confirmed accommodation
              yet
            </h3>

            <p>
              Once you successfully pay
              for an accommodation, your
              allocation and the owner's
              contact details will appear
              here.
            </p>

            <button
              type="button"
              className="details-primary-button"
              onClick={() =>
                router.push("/")
              }
            >
              Find Accommodation
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "20px",
            }}
          >
            {studentBookings.map(
              (booking) => {
                const property =
                  booking.property;

                const owner =
                  booking.owner;

                return (
                  <article
                    key={booking.id}
                    style={{
                      background:
                        "#ffffff",
                      border:
                        "1px solid #dbeafe",
                      borderRadius:
                        "18px",
                      padding: "22px",
                      boxShadow:
                        "0 6px 20px rgba(0,0,0,0.05)",
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
                        gap: "20px",
                        flexWrap:
                          "wrap",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display:
                              "flex",
                            alignItems:
                              "center",
                            gap: "10px",
                            flexWrap:
                              "wrap",
                          }}
                        >
                          <p
                            className="hero-label"
                            style={{
                              margin: 0,
                            }}
                          >
                            ALLOCATION
                            CONFIRMED
                          </p>

                          <span
                            style={{
                              padding:
                                "6px 10px",
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
                            ✓ PAID
                          </span>
                        </div>

                        <h2
                          style={{
                            marginTop:
                              "8px",
                          }}
                        >
                          {property?.name ||
                            "Accommodation"}
                        </h2>

                        <p
                          style={{
                            marginTop:
                              "6px",
                            color:
                              "#555",
                          }}
                        >
                          📍{" "}
                          {property?.location ||
                            "Location not specified"}
                        </p>
                      </div>

                      <div
                        style={{
                          padding:
                            "12px 16px",
                          borderRadius:
                            "12px",
                          background:
                            "#eff6ff",
                          color:
                            "#1e40af",
                          fontWeight:
                            700,
                          minWidth:
                            "180px",
                        }}
                      >
                        <div
                          style={{
                            fontSize:
                              "13px",
                            color:
                              "#6b7280",
                            marginBottom:
                              "4px",
                          }}
                        >
                          Amount Paid
                        </div>

                        <div
                          style={{
                            fontSize:
                              "20px",
                          }}
                        >
                          GH₵{" "}
                          {Number(
                            booking.total_amount
                          ).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display:
                          "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "12px",
                        marginTop:
                          "22px",
                      }}
                    >
                      <div
                        style={{
                          padding:
                            "14px",
                          borderRadius:
                            "12px",
                          background:
                            "#f9fafb",
                        }}
                      >
                        <span
                          style={{
                            display:
                              "block",
                            fontSize:
                              "12px",
                            color:
                              "#6b7280",
                            marginBottom:
                              "5px",
                          }}
                        >
                          Room Type
                        </span>

                        <strong>
                          {property?.room_type ||
                            "Not specified"}
                        </strong>
                      </div>

                      <div
                        style={{
                          padding:
                            "14px",
                          borderRadius:
                            "12px",
                          background:
                            "#f9fafb",
                        }}
                      >
                        <span
                          style={{
                            display:
                              "block",
                            fontSize:
                              "12px",
                            color:
                              "#6b7280",
                            marginBottom:
                              "5px",
                          }}
                        >
                          University
                        </span>

                        <strong>
                          {property?.university ||
                            "Not specified"}
                        </strong>
                      </div>

                      <div
                        style={{
                          padding:
                            "14px",
                          borderRadius:
                            "12px",
                          background:
                            "#f9fafb",
                        }}
                      >
                        <span
                          style={{
                            display:
                              "block",
                            fontSize:
                              "12px",
                            color:
                              "#6b7280",
                            marginBottom:
                              "5px",
                          }}
                        >
                          Payment Date
                        </span>

                        <strong>
                          {booking.paid_at
                            ? new Date(
                                booking.paid_at
                              ).toLocaleString()
                            : "Not available"}
                        </strong>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop:
                          "20px",
                        padding:
                          "18px",
                        borderRadius:
                          "14px",
                        background:
                          "#f0fdf4",
                        border:
                          "1px solid #bbf7d0",
                      }}
                    >
                      <p className="hero-label">
                        PROPERTY OWNER
                      </p>

                      <h3
                        style={{
                          marginTop:
                            "5px",
                        }}
                      >
                        {owner?.full_name ||
                          "Property Owner"}
                      </h3>

                      <div
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          justifyContent:
                            "space-between",
                          gap: "12px",
                          flexWrap:
                            "wrap",
                          marginTop:
                            "10px",
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            color:
                              "#166534",
                            fontWeight:
                              600,
                          }}
                        >
                          📞{" "}
                          {owner?.phone ||
                            "Owner phone number not provided"}
                        </p>

                        {owner?.phone && (
                          <a
                            href={`tel:${owner.phone}`}
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
                                "#166534",
                              color:
                                "#ffffff",
                              textDecoration:
                                "none",
                              fontWeight:
                                700,
                            }}
                          >
                            📞 Call Owner
                          </a>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop:
                          "18px",
                        display:
                          "flex",
                        justifyContent:
                          "space-between",
                        gap: "12px",
                        flexWrap:
                          "wrap",
                        alignItems:
                          "center",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize:
                            "12px",
                          color:
                            "#777",
                          wordBreak:
                            "break-word",
                        }}
                      >
                        Payment reference:{" "}
                        {booking.paystack_reference ||
                          "Not available"}
                      </p>

                      {property?.id && (
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/property/${property.id}`
                            )
                          }
                        >
                          View Property
                        </button>
                      )}
                    </div>
                  </article>
                );
              }
            )}
          </div>
        )}
      </section>
    </main>
  );
}