import { NextRequest, NextResponse } from "next/server";
import { sql, withRetry } from "@/lib/db";

const DB_UNAVAILABLE = NextResponse.json({ error: "Couldn't reach the database — please try again." }, { status: 503 });

export async function GET() {
  try {
    const rows = await withRetry(() => sql`
      SELECT org_name, to_char(late_cutoff, 'HH24:MI') AS late_cutoff, grace_minutes
      FROM settings WHERE id = 1
    `);
    return NextResponse.json({ settings: rows[0] ?? { org_name: "SOC Attendance", late_cutoff: "09:00", grace_minutes: 0 } });
  } catch (err) {
    console.error("GET /api/settings failed:", err);
    return DB_UNAVAILABLE;
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const orgName = typeof body?.orgName === "string" && body.orgName.trim() ? body.orgName.trim() : "SOC Attendance";
  const lateCutoff = typeof body?.lateCutoff === "string" && /^\d{2}:\d{2}$/.test(body.lateCutoff) ? body.lateCutoff : "09:00";
  const graceMinutes = Number.isFinite(Number(body?.graceMinutes)) ? Math.max(0, Math.min(120, Number(body.graceMinutes))) : 0;

  try {
    const rows = await withRetry(() => sql`
      UPDATE settings SET org_name = ${orgName}, late_cutoff = ${lateCutoff}, grace_minutes = ${graceMinutes}
      WHERE id = 1
      RETURNING org_name, to_char(late_cutoff, 'HH24:MI') AS late_cutoff, grace_minutes
    `);
    return NextResponse.json({ settings: rows[0] });
  } catch (err) {
    console.error("PUT /api/settings failed:", err);
    return DB_UNAVAILABLE;
  }
}
