import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PaystackWebhook = {
  event?: string;
  data?: {
    id?: number;
    reference?: string;
    transfer_code?: string;
    status?: string;
    amount?: number;
    currency?: string;
    reason?: string;
  };
};

export async function POST(request: Request) {
  try {
    /*
     * =====================================================
     * LOAD PAYSTACK SECRET
     * =====================================================
     */

    const secretKey =
      process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      console.error(
        "PAYSTACK_SECRET_KEY is not configured."
      );

      return NextResponse.json(
        {
          error:
            "Webhook is not configured.",
        },
        { status: 500 }
      );
    }

    /*
     * =====================================================
     * READ RAW BODY
     * =====================================================
     *
     * Paystack signs the raw request body.
     * The signature must therefore be calculated before
     * JSON parsing changes the payload.
     */

    const rawBody = await request.text();

    const signature =
      request.headers.get(
        "x-paystack-signature"
      );

    if (!signature) {
      return NextResponse.json(
        {
          error:
            "Missing Paystack signature.",
        },
        { status: 401 }
      );
    }

    /*
     * =====================================================
     * VERIFY PAYSTACK SIGNATURE
     * =====================================================
     */

    const expectedSignature =
      crypto
        .createHmac(
          "sha512",
          secretKey
        )
        .update(rawBody)
        .digest("hex");

    const providedBuffer =
      Buffer.from(
        signature,
        "utf8"
      );

    const expectedBuffer =
      Buffer.from(
        expectedSignature,
        "utf8"
      );

    if (
      providedBuffer.length !==
        expectedBuffer.length ||
      !crypto.timingSafeEqual(
        providedBuffer,
        expectedBuffer
      )
    ) {
      console.error(
        "Invalid Paystack webhook signature."
      );

      return NextResponse.json(
        {
          error:
            "Invalid webhook signature.",
        },
        { status: 401 }
      );
    }

    /*
     * =====================================================
     * PARSE EVENT
     * =====================================================
     */

    let event: PaystackWebhook;

    try {
      event =
        JSON.parse(
          rawBody
        ) as PaystackWebhook;
    } catch {
      return NextResponse.json(
        {
          error:
            "Invalid webhook payload.",
        },
        { status: 400 }
      );
    }

    const eventName =
      String(
        event.event || ""
      ).toLowerCase();

    const transfer =
      event.data;

    /*
     * =====================================================
     * IGNORE NON-TRANSFER EVENTS
     * =====================================================
     */

    const supportedEvents = [
      "transfer.success",
      "transfer.failed",
      "transfer.reversed",
    ];

    if (
      !supportedEvents.includes(
        eventName
      )
    ) {
      /*
       * Paystack expects a successful acknowledgement for
       * events we don't need to process.
       */
      return NextResponse.json(
        {
          received: true,
          ignored: true,
        },
        { status: 200 }
      );
    }

    /*
     * =====================================================
     * VALIDATE TRANSFER DATA
     * =====================================================
     */

    const reference =
      transfer?.reference;

    if (!reference) {
      console.error(
        "Paystack transfer webhook has no reference.",
        event
      );

      return NextResponse.json(
        {
          error:
            "Transfer reference is missing.",
        },
        { status: 400 }
      );
    }

    /*
     * =====================================================
     * FIND STUVANA PAYOUT
     * =====================================================
     */

    const {
      data: payout,
      error: payoutLookupError,
    } =
      await supabaseAdmin
        .from("owner_payouts")
        .select(
          "id, owner_id, amount, currency, reference, status, recipient_code, payout_method"
        )
        .eq(
          "reference",
          reference
        )
        .maybeSingle();

    if (payoutLookupError) {
      console.error(
        "Payout lookup error:",
        payoutLookupError
      );

      return NextResponse.json(
        {
          error:
            "Could not locate payout.",
        },
        { status: 500 }
      );
    }

    /*
     * A transfer can exist in Paystack without being a
     * STUVANA payout. Do not modify anything in that case.
     */

    if (!payout) {
      console.error(
        "No STUVANA payout found for Paystack reference:",
        reference
      );

      /*
       * Return 200 so Paystack does not keep retrying an
       * event that does not belong to this application.
       */
      return NextResponse.json(
        {
          received: true,
          matched: false,
        },
        { status: 200 }
      );
    }

    /*
     * =====================================================
     * NORMALIZE FINAL STATUS
     * =====================================================
     */

    let finalStatus:
      | "success"
      | "failed"
      | "reversed";

    if (
      eventName ===
      "transfer.success"
    ) {
      finalStatus =
        "success";
    } else if (
      eventName ===
      "transfer.failed"
    ) {
      finalStatus =
        "failed";
    } else {
      finalStatus =
        "reversed";
    }

    /*
     * =====================================================
     * IDEMPOTENCY
     * =====================================================
     *
     * Paystack can retry webhook events. If the payout is
     * already in the same final state, simply acknowledge it.
     */

    if (
      payout.status ===
        finalStatus &&
      finalStatus !==
        "failed" &&
      finalStatus !==
        "reversed"
    ) {
      return NextResponse.json(
        {
          received: true,
          duplicate: true,
        },
        { status: 200 }
      );
    }

    /*
     * =====================================================
     * UPDATE PAYOUT RECORD
     * =====================================================
     */

    const {
      error: payoutUpdateError,
    } =
      await supabaseAdmin
        .from("owner_payouts")
        .update({
          status:
            finalStatus,
          transfer_code:
            transfer?.transfer_code ||
            null,
          paystack_transfer_id:
            transfer?.id ||
            null,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          payout.id
        );

    if (payoutUpdateError) {
      console.error(
        "Payout webhook update error:",
        payoutUpdateError
      );

      return NextResponse.json(
        {
          error:
            "Could not update payout.",
        },
        { status: 500 }
      );
    }

    /*
     * =====================================================
     * RELEASE BOOKING EARNINGS ON FAILURE/REVERSAL
     * =====================================================
     *
     * Successful payouts keep their booking payout_id.
     *
     * Failed/reversed payouts release those bookings so the
     * owner can withdraw the earnings again.
     */

    if (
      finalStatus ===
        "failed" ||
      finalStatus ===
        "reversed"
    ) {
      const {
        error:
          releaseError,
      } =
        await supabaseAdmin
          .from("bookings")
          .update({
            payout_id:
              null,
          })
          .eq(
            "payout_id",
            payout.id
          );

      if (releaseError) {
        console.error(
          "Release booking earnings error:",
          releaseError
        );

        /*
         * The payout status has already been recorded.
         * Return 500 so Paystack can retry the webhook.
         */
        return NextResponse.json(
          {
            error:
              "Payout status updated, but booking earnings could not be released yet.",
          },
          { status: 500 }
        );
      }
    }

    /*
     * =====================================================
     * OWNER NOTIFICATION
     * =====================================================
     */

    let notificationTitle =
      "";

    let notificationMessage =
      "";

    if (
      finalStatus ===
      "success"
    ) {
      notificationTitle =
        "Payout successful";

      notificationMessage =
        `Your payout of GH₵${Number(
          payout.amount
        ).toLocaleString(
          "en-GH",
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }
        )} has been successfully processed.`;
    }

    if (
      finalStatus ===
      "failed"
    ) {
      notificationTitle =
        "Payout failed";

      notificationMessage =
        `Your payout of GH₵${Number(
          payout.amount
        ).toLocaleString(
          "en-GH",
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }
        )} could not be completed. Your eligible earnings have been released so you can try again.`;
    }

    if (
      finalStatus ===
      "reversed"
    ) {
      notificationTitle =
        "Payout reversed";

      notificationMessage =
        `Your payout of GH₵${Number(
          payout.amount
        ).toLocaleString(
          "en-GH",
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }
        )} was reversed. Your eligible earnings have been released so you can try again.`;
    }

    /*
     * Avoid creating duplicate notifications when Paystack
     * retries the same webhook.
     */
    if (
      notificationTitle &&
      notificationMessage
    ) {
      const {
        data:
          existingNotification,
        error:
          notificationLookupError,
      } =
        await supabaseAdmin
          .from(
            "owner_notifications"
          )
          .select("id")
          .eq(
            "owner_id",
            payout.owner_id
          )
          .eq(
            "booking_id",
            null
          )
          .eq(
            "type",
            `payout_${finalStatus}`
          )
          .ilike(
            "message",
            `%${reference}%`
          )
          .limit(1)
          .maybeSingle();

      /*
       * The reference check above may not match older notification
       * rows, so we also use a clean insert attempt below.
       */

      if (
        notificationLookupError
      ) {
        console.error(
          "Notification lookup error:",
          notificationLookupError
        );
      }

      if (
        !existingNotification
      ) {
        await supabaseAdmin
          .from(
            "owner_notifications"
          )
          .insert({
            owner_id:
              payout.owner_id,
            property_id:
              null,
            booking_id:
              null,
            type:
              `payout_${finalStatus}`,
            title:
              notificationTitle,
            message:
              `${notificationMessage} Reference: ${reference}.`,
            is_read:
              false,
          });
      }
    }

    /*
     * =====================================================
     * ACKNOWLEDGE PAYSTACK
     * =====================================================
     */

    return NextResponse.json(
      {
        received: true,
        success: true,
        payoutId:
          payout.id,
        reference,
        status:
          finalStatus,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "Paystack webhook error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Webhook processing failed.",
      },
      { status: 500 }
    );
  }
}