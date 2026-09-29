import { NextRequest, NextResponse } from "next/server";
import { sql, withRetry } from "@/lib/db";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const DB_UNAVAILABLE = NextResponse.json({ error: "Couldn't reach the database — please try again." }, { status: 503 });

/** Records what time a staff member left the office. Only valid for a day
 * they were already checked in (status = 'present'). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const staffId = Number(body?.staffId);
  const date = body?.date;
  const timeOut = body?.timeOut;

  if (!Number.isInteger(staffId)) {
    return NextResponse.json({ error: "Valid staffId is required." }, { status: 400 });
  }
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "Valid date (YYYY-MM-DD) is required." }, { status: 400 });
  }
  if (typeof timeOut !== "string" || !TIME_RE.test(timeOut)) {
    return NextResponse.json({ error: "Valid timeOut (HH:MM) is required." }, { status: 400 });
  }

  try {
    // Happy path is a single round trip: the WHERE clause enforces both rules
    // (must be checked in, checkout can't precede check-in) directly, so most
    // requests need no separate lookup query first.
    const rows = await withRetry(() => sql`
      UPDATE attendance_records SET time_out = ${timeOut}, updated_at = now()
      WHERE staff_id = ${staffId} AND date = ${date} AND status = 'present'
        AND (time_in IS NULL OR time_in <= ${timeOut}::time)
      RETURNING staff_id, staff_name, staff_designation, status,
                to_char(time_in,'HH24:MI') AS time_in, to_char(time_out,'HH24:MI') AS time_out,
                late, updated_at
    `);
    if (rows.length > 0) {
      return NextResponse.json({ record: rows[0] });
    }

    // Nothing matched — find out why, only now, to give a precise error.
    const existing = await withRetry(() => sql`
      SELECT status, to_char(time_in,'HH24:MI') AS time_in
      FROM attendance_records WHERE staff_id = ${staffId} AND date = ${date}
    `);
    const record = existing[0];
    if (!record || record.status !== "present") {
      return NextResponse.json({ error: "Mark check-in before recording a checkout time." }, { status: 400 });
    }
    return NextResponse.json({ error: "Checkout time can't be before the check-in time." }, { status: 400 });
  } catch (err) {
    console.error("POST /api/attendance/checkout failed:", err);
    return DB_UNAVAILABLE;
  }
}

export async function DELETE(req: NextRequest) {
  const staffId = Number(req.nextUrl.searchParams.get("staffId"));
  const date = req.nextUrl.searchParams.get("date");
  if (!Number.isInteger(staffId) || !date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "staffId and date (YYYY-MM-DD) are required." }, { status: 400 });
  }
  try {
    await withRetry(() => sql`UPDATE attendance_records SET time_out = NULL, updated_at = now() WHERE staff_id = ${staffId} AND date = ${date}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/attendance/checkout failed:", err);
    return DB_UNAVAILABLE;
  }
}
