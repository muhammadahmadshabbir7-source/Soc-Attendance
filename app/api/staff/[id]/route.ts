import { NextRequest, NextResponse } from "next/server";
import { sql, withRetry } from "@/lib/db";

const DB_UNAVAILABLE = NextResponse.json({ error: "Couldn't reach the database — please try again." }, { status: 503 });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staffId = Number(id);
  if (!Number.isInteger(staffId)) {
    return NextResponse.json({ error: "Invalid staff id." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.active !== "boolean") {
    return NextResponse.json({ error: "'active' (boolean) is required." }, { status: 400 });
  }

  try {
    const rows = await withRetry(() => sql`
      UPDATE staff SET active = ${body.active} WHERE id = ${staffId}
      RETURNING id, name, designation, active, created_at
    `);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Staff not found." }, { status: 404 });
    }
    return NextResponse.json({ staff: rows[0] });
  } catch (err) {
    console.error("PATCH /api/staff/[id] failed:", err);
    return DB_UNAVAILABLE;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staffId = Number(id);
  if (!Number.isInteger(staffId)) {
    return NextResponse.json({ error: "Invalid staff id." }, { status: 400 });
  }
  try {
    // Attendance history rows keep a name/designation snapshot and are kept
    // (staff_id is set to NULL by the foreign key's ON DELETE SET NULL).
    await withRetry(() => sql`DELETE FROM staff WHERE id = ${staffId}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/staff/[id] failed:", err);
    return DB_UNAVAILABLE;
  }
}
