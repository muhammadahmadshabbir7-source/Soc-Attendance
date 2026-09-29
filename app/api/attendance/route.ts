import { NextRequest, NextResponse } from "next/server";
import { sql, withRetry } from "@/lib/db";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const DB_UNAVAILABLE = NextResponse.json({ error: "Couldn't reach the database — please try again." }, { status: 503 });

function computeLate(timeIn: string, lateCutoff: string, graceMinutes: number): boolean {
  const [ch, cm] = lateCutoff.split(":").map(Number);
  const [th, tm] = timeIn.split(":").map(Number);
  return th * 60 + tm > ch * 60 + cm + graceMinutes;
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "Valid ?date=YYYY-MM-DD is required." }, { status: 400 });
  }
  try {
    const rows = await withRetry(() => sql`
      SELECT staff_id, staff_name, staff_designation, status,
             to_char(time_in, 'HH24:MI') AS time_in,
             to_char(time_out, 'HH24:MI') AS time_out,
             late, updated_at
      FROM attendance_records
      WHERE date = ${date}
    `);
    return NextResponse.json({ records: rows });
  } catch (err) {
    console.error("GET /api/attendance failed:", err);
    return DB_UNAVAILABLE;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const staffId = Number(body?.staffId);
  const date = body?.date;
  const status = body?.status;
  const timeIn = body?.timeIn ?? null;

  if (!Number.isInteger(staffId)) {
    return NextResponse.json({ error: "Valid staffId is required." }, { status: 400 });
  }
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "Valid date (YYYY-MM-DD) is required." }, { status: 400 });
  }
  if (!["present", "absent", "leave"].includes(status)) {
    return NextResponse.json({ error: "status must be present, absent or leave." }, { status: 400 });
  }
  if (status === "present" && (typeof timeIn !== "string" || !TIME_RE.test(timeIn))) {
    return NextResponse.json({ error: "Valid timeIn (HH:MM) is required for present." }, { status: 400 });
  }

  try {
    // One round trip instead of two: staff and settings don't depend on each
    // other, so look both up in a single query (matters a lot over the
    // Neon HTTP driver, where every query is its own network round trip).
    const lookupRows = await withRetry(() => sql`
      SELECT s.id, s.name, s.designation,
             to_char(st.late_cutoff, 'HH24:MI') AS late_cutoff, st.grace_minutes
      FROM staff s, settings st
      WHERE s.id = ${staffId} AND st.id = 1
    `);
    const staff = lookupRows[0];
    if (!staff) {
      return NextResponse.json({ error: "Staff not found." }, { status: 404 });
    }
    const settings = { late_cutoff: staff.late_cutoff ?? "09:00", grace_minutes: staff.grace_minutes ?? 0 };

    const finalTimeIn = status === "present" ? timeIn : null;
    const late = status === "present" ? computeLate(finalTimeIn, settings.late_cutoff, settings.grace_minutes) : false;

    const rows = await withRetry(() => sql`
      INSERT INTO attendance_records (staff_id, staff_name, staff_designation, date, status, time_in, late, updated_at)
      VALUES (${staff.id}, ${staff.name}, ${staff.designation}, ${date}, ${status}, ${finalTimeIn}, ${late}, now())
      ON CONFLICT (staff_id, date) WHERE staff_id IS NOT NULL
      DO UPDATE SET status = EXCLUDED.status, time_in = EXCLUDED.time_in, late = EXCLUDED.late,
                    staff_name = EXCLUDED.staff_name, staff_designation = EXCLUDED.staff_designation,
                    time_out = CASE WHEN EXCLUDED.status = 'present' THEN attendance_records.time_out ELSE NULL END,
                    updated_at = now()
      RETURNING staff_id, staff_name, staff_designation, status,
                to_char(time_in,'HH24:MI') AS time_in, to_char(time_out,'HH24:MI') AS time_out,
                late, updated_at
    `);

    return NextResponse.json({ record: rows[0] });
  } catch (err) {
    console.error("POST /api/attendance failed:", err);
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
    await withRetry(() => sql`DELETE FROM attendance_records WHERE staff_id = ${staffId} AND date = ${date}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/attendance failed:", err);
    return DB_UNAVAILABLE;
  }
}
