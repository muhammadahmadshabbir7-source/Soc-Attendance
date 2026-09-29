import { NextResponse } from "next/server";
import { sql, withRetry } from "@/lib/db";

export async function GET() {
  try {
    const rows = await withRetry(() => sql`
      SELECT
        to_char(date, 'YYYY-MM-DD') AS date,
        COUNT(*) FILTER (WHERE status = 'present')::int AS present_count,
        COUNT(*) FILTER (WHERE late)::int AS late_count,
        COUNT(*) FILTER (WHERE status = 'absent')::int AS absent_count,
        COUNT(*) FILTER (WHERE status = 'leave')::int AS leave_count
      FROM attendance_records
      GROUP BY date
      ORDER BY date DESC
      LIMIT 60
    `);
    return NextResponse.json({ history: rows });
  } catch (err) {
    console.error("GET /api/history failed:", err);
    return NextResponse.json({ error: "Couldn't reach the database — please try again." }, { status: 503 });
  }
}
