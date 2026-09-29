import { NextRequest, NextResponse } from "next/server";
import { sql, withRetry } from "@/lib/db";

const DB_UNAVAILABLE = NextResponse.json({ error: "Couldn't reach the database — please try again." }, { status: 503 });

export async function GET() {
  try {
    const rows = await withRetry(() => sql`
      SELECT
        s.id, s.name, s.designation, s.active, s.created_at,
        COUNT(ar.id) FILTER (WHERE ar.status IS NOT NULL)::int AS total_marked_days,
        COUNT(ar.id) FILTER (WHERE ar.status = 'present')::int AS present_days,
        COUNT(ar.id) FILTER (WHERE ar.status = 'absent')::int AS absent_days,
        COUNT(ar.id) FILTER (WHERE ar.status = 'leave')::int AS leave_days,
        COUNT(ar.id) FILTER (WHERE ar.late)::int AS late_days
      FROM staff s
      LEFT JOIN attendance_records ar ON ar.staff_id = s.id
      GROUP BY s.id
      ORDER BY s.name ASC
    `);
    return NextResponse.json({ staff: rows });
  } catch (err) {
    console.error("GET /api/staff failed:", err);
    return DB_UNAVAILABLE;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const designation = typeof body?.designation === "string" ? body.designation.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  try {
    const rows = await withRetry(() => sql`
      INSERT INTO staff (name, designation) VALUES (${name}, ${designation})
      RETURNING id, name, designation, active, created_at
    `);
    return NextResponse.json({ staff: rows[0] }, { status: 201 });
  } catch (err) {
    console.error("POST /api/staff failed:", err);
    return DB_UNAVAILABLE;
  }
}
