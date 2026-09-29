"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type StaffRow = {
  id: number;
  name: string;
  designation: string;
  active: boolean;
  total_marked_days: number;
  present_days: number;
  absent_days: number;
  leave_days: number;
  late_days: number;
};

type RecordRow = {
  staff_id: number;
  staff_name: string;
  staff_designation: string;
  status: "present" | "absent" | "leave";
  time_in: string | null;
  time_out: string | null;
  late: boolean;
};

type HistoryRow = {
  date: string;
  present_count: number;
  late_count: number;
  absent_count: number;
  leave_count: number;
};

type Settings = { org_name: string; late_cutoff: string; grace_minutes: number };

type Tab = "dashboard" | "attendance" | "history" | "staff" | "settings";

const STATUS_LABEL: Record<string, string> = {
  present: "On time",
  late: "Late",
  absent: "Absent",
  leave: "On leave",
  unmarked: "Not marked",
};

function pad2(n: number) {
  return String(n).length < 2 ? "0" + n : String(n);
}
function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}
function shiftDate(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dt.getFullYear() + "-" + pad2(dt.getMonth() + 1) + "-" + pad2(dt.getDate());
}
function formatDisplay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    dow: dt.toLocaleDateString(undefined, { weekday: "long" }),
    full: dt.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }),
    short: dt.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
  };
}
function nowHHMM() {
  const d = new Date();
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}
function addMinutes(hhmm: string, mins: number) {
  const [h, m] = hhmm.split(":").map(Number);
  let total = h * 60 + m + mins;
  total = Math.max(0, Math.min(23 * 60 + 59, total));
  return pad2(Math.floor(total / 60)) + ":" + pad2(total % 60);
}
function minutesBetween(a: string, b: string) {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return ah * 60 + am - (bh * 60 + bm);
}
function fmt12(hhmm: string) {
  if (!hhmm) return "";
  const [h0, m] = hhmm.split(":").map(Number);
  const h = h0 % 12 || 12;
  return h + ":" + pad2(m) + " " + (h0 < 12 ? "AM" : "PM");
}
function initials(name: string) {
  const parts = (name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}
function hoursWorked(timeIn: string, timeOut: string) {
  const mins = Math.max(0, minutesBetween(timeOut, timeIn));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/* ============================== Icons ============================== */
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const IconDashboard = () => (
  <Icon>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </Icon>
);
const IconAttendance = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="17" rx="2.5" />
    <path d="M3 9h18" />
    <path d="M8 2v4M16 2v4" />
    <path d="m8 14 2.5 2.5L16 11" />
  </Icon>
);
const IconHistory = () => (
  <Icon>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l3 2" />
    <path d="M5 3 3 5M19 3l2 2" />
  </Icon>
);
const IconStaff = () => (
  <Icon>
    <circle cx="9" cy="8" r="3.3" />
    <path d="M3.5 20c.8-3.4 3-5.2 5.5-5.2s4.7 1.8 5.5 5.2" />
    <circle cx="17.2" cy="8.5" r="2.6" />
    <path d="M15.8 14.9c2.2.2 3.9 1.9 4.7 5.1" />
  </Icon>
);
const IconSettings = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19.6a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H4.4a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10.5a1.7 1.7 0 0 0 1.04-1.56V4.4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10.5a1.7 1.7 0 0 0 1.56 1.04h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.04Z" />
  </Icon>
);
const NAV: { key: Tab; label: string; icon: () => React.ReactNode }[] = [
  { key: "dashboard", label: "Dashboard", icon: IconDashboard },
  { key: "attendance", label: "Attendance", icon: IconAttendance },
  { key: "history", label: "History", icon: IconHistory },
  { key: "staff", label: "Staff", icon: IconStaff },
  { key: "settings", label: "Settings", icon: IconSettings },
];

/* ============================== Root ============================== */
export default function SocAttendanceApp() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [date, setDate] = useState(todayISO());
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [records, setRecords] = useState<Record<number, RecordRow>>({});
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [settings, setSettings] = useState<Settings>({ org_name: "SOC Attendance", late_cutoff: "09:00", grace_minutes: 0 });
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  const loadStaff = useCallback(async () => {
    const res = await fetch("/api/staff");
    if (res.ok) setStaff((await res.json()).staff);
  }, []);
  const loadRecords = useCallback(async (d: string) => {
    const res = await fetch("/api/attendance?date=" + d);
    if (res.ok) {
      const data = await res.json();
      const map: Record<number, RecordRow> = {};
      (data.records as RecordRow[]).forEach((r) => (map[r.staff_id] = r));
      setRecords(map);
    }
  }, []);
  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/history");
    if (res.ok) setHistory((await res.json()).history);
  }, []);
  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/settings");
    if (res.ok) {
      const loadedSettings = (await res.json()).settings as Settings;
      setSettings({
        ...loadedSettings,
        org_name: loadedSettings.org_name === "Hazri" ? "SOC Attendance" : loadedSettings.org_name,
      });
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadStaff(), loadRecords(date), loadHistory(), loadSettings()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRecords(tab === "dashboard" ? todayISO() : date);
  }, [date, tab, loadRecords]);

  const activeStaff = useMemo(() => staff.filter((s) => s.active), [staff]);
  const inactiveStaff = useMemo(() => staff.filter((s) => !s.active), [staff]);

  const effectiveCutoff = useMemo(
    () => addMinutes(settings.late_cutoff || "09:00", Number(settings.grace_minutes) || 0),
    [settings]
  );

  function statusOf(staffId: number): "present" | "late" | "absent" | "leave" | "unmarked" {
    const r = records[staffId];
    if (!r) return "unmarked";
    if (r.status === "present") return r.late ? "late" : "present";
    return r.status;
  }

  async function markAttendance(staffId: number, status: "present" | "absent" | "leave", timeInRaw?: string | null) {
    const timeIn = status === "present" ? timeInRaw || nowHHMM() : null;
    const res = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId, date, status, timeIn }),
    });
    if (!res.ok) {
      showToast("Couldn't save — please try again.");
      return;
    }
    const data = await res.json();
    setRecords((prev) => ({ ...prev, [staffId]: data.record }));
    loadStaff();
  }

  async function markCheckout(staffId: number, timeOutRaw?: string | null) {
    const timeOut = timeOutRaw || nowHHMM();
    const res = await fetch("/api/attendance/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId, date, timeOut }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "Couldn't record checkout time.");
      return;
    }
    const data = await res.json();
    setRecords((prev) => ({ ...prev, [staffId]: data.record }));
  }

  async function clearAttendance(staffId: number) {
    const res = await fetch(`/api/attendance?staffId=${staffId}&date=${date}`, { method: "DELETE" });
    if (!res.ok) {
      showToast("Couldn't clear the record.");
      return;
    }
    setRecords((prev) => {
      const next = { ...prev };
      delete next[staffId];
      return next;
    });
    loadStaff();
  }

  async function addStaff(name: string, designation: string) {
    if (!name.trim()) return;
    const res = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, designation }),
    });
    if (!res.ok) {
      showToast("Couldn't add staff member.");
      return;
    }
    setAddOpen(false);
    showToast("Staff member added.");
    loadStaff();
  }

  async function setStaffActive(staffId: number, active: boolean) {
    const res = await fetch(`/api/staff/${staffId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (res.ok) {
      showToast(active ? "Staff member reactivated." : "Removed from the active list (history preserved).");
      loadStaff();
    }
  }

  async function deleteStaffHard(staffId: number) {
    if (!confirm("This staff member will be permanently deleted. Continue?")) return;
    const res = await fetch(`/api/staff/${staffId}`, { method: "DELETE" });
    if (res.ok) {
      showToast("Staff member permanently deleted.");
      loadStaff();
    }
  }

  async function saveSettings(draft: Settings) {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgName: draft.org_name, lateCutoff: draft.late_cutoff, graceMinutes: draft.grace_minutes }),
    });
    if (res.ok) {
      setSettings((await res.json()).settings);
      showToast("Settings saved.");
    }
  }

  const isToday = date === todayISO();
  const d = formatDisplay(date);

  const counts = { present: 0, late: 0, absent: 0, leave: 0 };
  activeStaff.forEach((s) => {
    const st = statusOf(s.id);
    if (st === "present") counts.present++;
    else if (st === "late") {
      counts.present++;
      counts.late++;
    } else if (st === "absent") counts.absent++;
    else if (st === "leave") counts.leave++;
  });
  const unmarked = Math.max(0, activeStaff.length - Object.keys(records).length);
  const onTime = counts.present - counts.late;

  const pageTitle = NAV.find((n) => n.key === tab)?.label ?? "Dashboard";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="mark">H</div>
          <div className="name">
            {settings.org_name}
            <small>SOC Attendance</small>
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <button key={item.key} className={"nav-item" + (tab === item.key ? " active" : "")} onClick={() => setTab(item.key)}>
              {item.icon()}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-user">
            <div className="avatar">AD</div>
            <div className="who">
              <div className="name">Admin</div>
              <div className="role">Signed in</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{pageTitle}</h1>
            <div className="sub">
              {tab === "dashboard" && `${formatDisplay(todayISO()).full} · ${activeStaff.length} active staff`}
              {tab === "attendance" && `${d.full} — ${d.dow}`}
              {tab === "history" && "Day-by-day attendance record"}
              {tab === "staff" && `${activeStaff.length} active`}
              {tab === "settings" && "Late cutoff and organization name"}
            </div>
          </div>
          {(tab === "dashboard" || tab === "attendance") && (
            <button className="cutoff-chip" onClick={() => setTab("settings")}>
              ⏰ Cutoff {fmt12(settings.late_cutoff)}
              {settings.grace_minutes ? ` +${settings.grace_minutes}m` : ""}
            </button>
          )}
        </div>

        {loading ? (
          <div className="empty">Loading...</div>
        ) : tab === "dashboard" ? (
          <DashboardTab
            activeStaff={activeStaff}
            records={records}
            statusOf={statusOf}
            counts={counts}
            onTime={onTime}
            unmarked={unmarked}
            history={history}
            onGoAttendance={() => setTab("attendance")}
          />
        ) : tab === "attendance" ? (
          <AttendanceTab
            isToday={isToday}
            date={date}
            setDate={setDate}
            activeStaff={activeStaff}
            records={records}
            statusOf={statusOf}
            effectiveCutoff={effectiveCutoff}
            onMark={markAttendance}
            onClear={clearAttendance}
            onCheckout={markCheckout}
            onGoStaff={() => setTab("staff")}
          />
        ) : tab === "history" ? (
          <HistoryTab
            history={history}
            onJump={(dt) => {
              setDate(dt);
              setTab("attendance");
            }}
          />
        ) : tab === "staff" ? (
          <StaffTab
            activeStaff={activeStaff}
            inactiveStaff={inactiveStaff}
            onAddOpen={() => setAddOpen(true)}
            onSetActive={setStaffActive}
            onDeleteHard={deleteStaffHard}
          />
        ) : (
          <SettingsTab settings={settings} effectiveCutoff={effectiveCutoff} onSave={saveSettings} />
        )}

        <div className="footnote">SOC Attendance — daily attendance, at a glance.</div>
      </main>

      {addOpen && <AddStaffModal onClose={() => setAddOpen(false)} onSubmit={addStaff} />}
      <div className={"toast" + (toast ? " show" : "")}>{toast}</div>
    </div>
  );
}

/* ============================== Dashboard ============================== */
function DashboardTab({
  activeStaff,
  records,
  statusOf,
  counts,
  onTime,
  unmarked,
  history,
  onGoAttendance,
}: {
  activeStaff: StaffRow[];
  records: Record<number, RecordRow>;
  statusOf: (id: number) => "present" | "late" | "absent" | "leave" | "unmarked";
  counts: { present: number; late: number; absent: number; leave: number };
  onTime: number;
  unmarked: number;
  history: HistoryRow[];
  onGoAttendance: () => void;
}) {
  const total = activeStaff.length;
  const marked = total - unmarked;
  const pct = total > 0 ? Math.round((marked / total) * 100) : 0;

  const lateStaff = activeStaff.filter((s) => s.total_marked_days >= 3 && Math.round((s.late_days / s.total_marked_days) * 100) >= 25);
  const absentStaff = activeStaff.filter((s) => statusOf(s.id) === "absent");

  // sort: late first, then unmarked, then on-time/absent/leave, for the snapshot grid
  const order = { late: 0, unmarked: 1, absent: 2, leave: 3, present: 4 };
  const sortedStaff = [...activeStaff].sort((a, b) => order[statusOf(a.id)] - order[statusOf(b.id)]);

  return (
    <>
      <div className="dash-row">
        <div className="card gauge-card">
          <span className="hint" style={{ alignSelf: "flex-start", padding: "0 2px", color: "var(--muted)", fontSize: 12.5, fontWeight: 600 }}>
            Today's completion
          </span>
          <div className="gauge-wrap">
            <RadialGauge percent={pct} />
            <div className="gauge-pct">
              <span className="num">{pct}%</span>
              <span className="lbl">marked</span>
            </div>
          </div>
          <div className="gauge-legend">
            <span className="row">
              <span>
                <span className="dot" style={{ background: "var(--good)" }} />
                On time
              </span>
              <span className="val">{onTime}</span>
            </span>
            <span className="row">
              <span>
                <span className="dot" style={{ background: "var(--late)" }} />
                Late
              </span>
              <span className="val">{counts.late}</span>
            </span>
            <span className="row">
              <span>
                <span className="dot" style={{ background: "var(--absent)" }} />
                Absent
              </span>
              <span className="val">{counts.absent}</span>
            </span>
            <span className="row">
              <span>
                <span className="dot" style={{ background: "var(--leave)" }} />
                Leave
              </span>
              <span className="val">{counts.leave}</span>
            </span>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 14, width: "100%" }} onClick={onGoAttendance}>
            Mark attendance
          </button>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Today's snapshot</h2>
            <span className="hint">Late arrivals shown first</span>
          </div>
          {activeStaff.length === 0 ? (
            <div className="empty">
              <div className="big">🧑‍💼</div>No staff members yet.
            </div>
          ) : (
            <div className="snap-grid">
              {sortedStaff.map((s) => {
                const st = statusOf(s.id);
                const r = records[s.id];
                return (
                  <div key={s.id} className={"snap-card" + (st === "late" ? " is-late" : "")}>
                    <div className="top">
                      <div className="avatar">{initials(s.name)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="name">{s.name}</div>
                        <div className="role">{s.designation || "—"}</div>
                      </div>
                    </div>
                    <div className="bottom">
                      <span className={"pill " + st} style={{ fontSize: 10.5, padding: "2px 7px" }}>
                        {STATUS_LABEL[st]}
                      </span>
                      {!r?.time_in && <span className="time">—</span>}
                    </div>
                    {r?.time_in && (
                      <div className="snap-times">
                        <span>
                          In <b>{fmt12(r.time_in)}</b>
                        </span>
                        <span>
                          Out <b>{r.time_out ? fmt12(r.time_out) : "—"}</b>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="dash-row reverse">
        <AttendanceSummaryChart history={history} />

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="card-head">
              <h2>Absent today</h2>
            </div>
            {absentStaff.length === 0 ? (
              <div className="empty" style={{ padding: "18px 16px" }}>
                Nobody is absent today.
              </div>
            ) : (
              <div className="mini-list">
                {absentStaff.map((s) => (
                  <div className="mini-row" key={s.id}>
                    <div className="avatar">{initials(s.name)}</div>
                    <div className="who">
                      <div className="name">{s.name}</div>
                      <div className="role">{s.designation || "—"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 0 }}>
            <div className="card-head">
              <h2>Frequently late</h2>
            </div>
            {lateStaff.length === 0 ? (
              <div className="empty" style={{ padding: "18px 16px" }}>
                Nobody has a high late rate yet.
              </div>
            ) : (
              <div className="mini-list">
                {lateStaff.slice(0, 5).map((s) => {
                  const pct2 = Math.round((s.late_days / s.total_marked_days) * 100);
                  return (
                    <div className="mini-row" key={s.id}>
                      <div className="avatar" style={{ background: "var(--late-soft)", color: "var(--late-ink)" }}>
                        {initials(s.name)}
                      </div>
                      <div className="who">
                        <div className="name">{s.name}</div>
                        <div className="role">
                          {s.late_days}/{s.total_marked_days} days late
                        </div>
                      </div>
                      <span className="pill late">{pct2}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function RadialGauge({ percent }: { percent: number }) {
  const size = 168;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, percent)) / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset .4s ease" }}
      />
    </svg>
  );
}

function AttendanceSummaryChart({ history }: { history: HistoryRow[] }) {
  const days = useMemo(() => [...history].slice(0, 14).reverse(), [history]);
  const [hover, setHover] = useState<{ x: number; y: number; day: HistoryRow } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const chartH = 150;
  const barW = 22;
  const gap = 18;
  const leftPad = 28;
  const svgW = Math.max(280, days.length * (barW + gap) + leftPad + 10);

  const maxTotal = Math.max(1, ...days.map((d) => d.present_count + d.absent_count + d.leave_count));
  const niceMax = Math.ceil(maxTotal / 4) * 4 || 4;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMax * f));

  function segmentsFor(day: HistoryRow) {
    const onTime = Math.max(0, day.present_count - day.late_count);
    return [
      { key: "ontime", value: onTime, color: "var(--good)" },
      { key: "late", value: day.late_count, color: "var(--late)" },
      { key: "absent", value: day.absent_count, color: "var(--absent)" },
      { key: "leave", value: day.leave_count, color: "var(--leave)" },
    ].filter((s) => s.value > 0);
  }

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="card-head">
        <h2>Attendance summary</h2>
        <span className="hint">Last {days.length || 0} recorded days</span>
      </div>
      <div className="chart-legend">
        <span className="item">
          <span className="swatch" style={{ background: "var(--good)" }} />
          On time
        </span>
        <span className="item">
          <span className="swatch" style={{ background: "var(--late)" }} />
          Late
        </span>
        <span className="item">
          <span className="swatch" style={{ background: "var(--absent)" }} />
          Absent
        </span>
        <span className="item">
          <span className="swatch" style={{ background: "var(--leave)" }} />
          Leave
        </span>
      </div>
      {days.length === 0 ? (
        <div className="empty">No attendance recorded yet.</div>
      ) : (
        <div className="chart-wrap" ref={wrapRef} style={{ position: "relative" }}>
          <svg width={svgW} height={chartH + 34} role="img" aria-label="Attendance over recent days">
            {yTicks.map((tv, i) => {
              const y = chartH - (tv / niceMax) * chartH;
              return (
                <g key={i}>
                  <line x1={leftPad} x2={svgW - 4} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
                  <text x={0} y={y + 3} fontSize="9.5" fill="var(--muted)">
                    {tv}
                  </text>
                </g>
              );
            })}
            {days.map((day, i) => {
              const x = leftPad + i * (barW + gap) + gap / 2;
              let cursor = 0;
              const segs = segmentsFor(day);
              return (
                <g
                  key={day.date}
                  onMouseEnter={(e) => {
                    const wrapRect = wrapRef.current?.getBoundingClientRect();
                    const rect = (e.currentTarget as SVGGElement).getBoundingClientRect();
                    if (wrapRect) {
                      setHover({ x: rect.left - wrapRect.left + rect.width / 2 + (wrapRef.current?.scrollLeft || 0), y: rect.top - wrapRect.top, day });
                    }
                  }}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: "pointer" }}
                >
                  <rect x={x} y={0} width={barW} height={chartH} fill="transparent" />
                  {segs.map((seg) => {
                    const topVal = cursor + seg.value;
                    const yTop = chartH - (topVal / niceMax) * chartH;
                    const yBottom = chartH - (cursor / niceMax) * chartH;
                    cursor = topVal;
                    const h = Math.max(1, yBottom - yTop - 2);
                    return <rect key={seg.key} x={x} y={yTop} width={barW} height={h} rx={2.5} fill={seg.color} opacity={hover && hover.day.date === day.date ? 1 : hover ? 0.45 : 1} />;
                  })}
                  <text x={x + barW / 2} y={chartH + 16} fontSize="9.5" fill="var(--muted)" textAnchor="middle">
                    {formatDisplay(day.date).short}
                  </text>
                </g>
              );
            })}
          </svg>
          {hover && (
            <div className="bar-tooltip" style={{ left: hover.x, top: hover.y }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{formatDisplay(hover.day.date).full}</div>
              <div className="row">
                <span className="dot" style={{ background: "var(--good)" }} />
                On time: {hover.day.present_count - hover.day.late_count}
              </div>
              <div className="row">
                <span className="dot" style={{ background: "var(--late)" }} />
                Late: {hover.day.late_count}
              </div>
              <div className="row">
                <span className="dot" style={{ background: "var(--absent)" }} />
                Absent: {hover.day.absent_count}
              </div>
              <div className="row">
                <span className="dot" style={{ background: "var(--leave)" }} />
                Leave: {hover.day.leave_count}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================== Attendance ============================== */
function AttendanceTab({
  isToday,
  date,
  setDate,
  activeStaff,
  records,
  statusOf,
  effectiveCutoff,
  onMark,
  onClear,
  onCheckout,
  onGoStaff,
}: {
  isToday: boolean;
  date: string;
  setDate: (d: string) => void;
  activeStaff: StaffRow[];
  records: Record<number, RecordRow>;
  statusOf: (id: number) => "present" | "late" | "absent" | "leave" | "unmarked";
  effectiveCutoff: string;
  onMark: (id: number, status: "present" | "absent" | "leave", timeIn?: string | null) => void;
  onClear: (id: number) => void;
  onCheckout: (id: number, timeOut?: string | null) => void;
  onGoStaff: () => void;
}) {
  const d = formatDisplay(date);
  const counts = { present: 0, late: 0, absent: 0, leave: 0 };
  activeStaff.forEach((s) => {
    const st = statusOf(s.id);
    if (st === "present") counts.present++;
    else if (st === "late") {
      counts.present++;
      counts.late++;
    } else if (st === "absent") counts.absent++;
    else if (st === "leave") counts.leave++;
  });
  const unmarked = Math.max(0, activeStaff.length - Object.keys(records).length);

  return (
    <>
      <div className="stat-grid">
        <StatTile num={activeStaff.length} lbl="Total staff" color="var(--line-strong)" />
        <StatTile num={counts.present} lbl="Present" color="var(--good)" />
        <StatTile num={counts.late} lbl="Late today" color="var(--late)" />
        <StatTile num={counts.absent} lbl="Absent" color="var(--absent)" />
        <StatTile num={unmarked} lbl="Not marked" color="var(--unmarked)" />
      </div>

      <div className="date-nav">
        <button className="icon-btn" aria-label="Previous day" onClick={() => setDate(shiftDate(date, -1))}>
          ‹
        </button>
        <div className="date-label">
          {d.full} {isToday && <span className="late-tag">Today</span>}
          <span className="dow">{d.dow}</span>
        </div>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="icon-btn" aria-label="Next day" onClick={() => setDate(shiftDate(date, 1))}>
          ›
        </button>
        {!isToday && (
          <button className="btn" onClick={() => setDate(todayISO())}>
            Today
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Attendance register</h2>
          <span className="hint">Tap Present to record the time instantly</span>
        </div>
        <div className="card-body">
          {activeStaff.length === 0 ? (
            <div className="empty">
              <div className="big">🧑‍💼</div>
              No staff members added yet.
              <br />
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onGoStaff}>
                Add staff
              </button>
            </div>
          ) : (
            activeStaff.map((s) => (
              <AttendanceRow
                key={s.id}
                staff={s}
                record={records[s.id]}
                status={statusOf(s.id)}
                effectiveCutoff={effectiveCutoff}
                onMark={onMark}
                onClear={onClear}
                onCheckout={onCheckout}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

function StatTile({ num, lbl, color }: { num: number; lbl: string; color: string }) {
  return (
    <div className="stat-tile" style={{ ["--tile-color" as string]: color }}>
      <div className="num">{num}</div>
      <div className="lbl">{lbl}</div>
    </div>
  );
}

function AttendanceRow({
  staff,
  record,
  status,
  effectiveCutoff,
  onMark,
  onClear,
  onCheckout,
}: {
  staff: StaffRow;
  record: RecordRow | undefined;
  status: "present" | "late" | "absent" | "leave" | "unmarked";
  effectiveCutoff: string;
  onMark: (id: number, status: "present" | "absent" | "leave", timeIn?: string | null) => void;
  onClear: (id: number) => void;
  onCheckout: (id: number, timeOut?: string | null) => void;
}) {
  const [time, setTime] = useState(record?.time_in || "");
  const [timeOut, setTimeOut] = useState(record?.time_out || "");
  useEffect(() => setTime(record?.time_in || ""), [record?.time_in]);
  useEffect(() => setTimeOut(record?.time_out || ""), [record?.time_out]);

  const lateMinutes = status === "late" && record?.time_in ? minutesBetween(record.time_in, effectiveCutoff) : 0;
  const pillKey = status === "late" ? "late" : record ? record.status : "unmarked";
  const isPresent = record?.status === "present";

  return (
    <div className={"arow" + (status === "late" ? " is-late" : "")}>
      <div className="avatar">{initials(staff.name)}</div>
      <div className="who">
        <div className="name">{staff.name}</div>
        <div className="role">{staff.designation}</div>
      </div>
      <div className="arow-controls">
        <span className={"pill " + status}>{STATUS_LABEL[pillKey]}</span>
        {status === "late" && <span className="late-note">{lateMinutes} min late</span>}
        {isPresent && record?.time_out && (
          <span className="late-note" style={{ color: "var(--good-ink)" }}>
            {hoursWorked(record.time_in!, record.time_out)} worked
          </span>
        )}
        <input
          type="time"
          aria-label="Time in"
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
            if (record?.status === "present") onMark(staff.id, "present", e.target.value);
          }}
        />
        <button className={"btn" + (record?.status === "present" ? " on present" : "")} onClick={() => onMark(staff.id, "present", time)}>
          Present
        </button>
        <button className={"btn" + (record?.status === "absent" ? " on absent" : "")} onClick={() => onMark(staff.id, "absent")}>
          Absent
        </button>
        <button className={"btn" + (record?.status === "leave" ? " on leave" : "")} onClick={() => onMark(staff.id, "leave")}>
          Leave
        </button>
        {isPresent && (
          <>
            <input
              type="time"
              aria-label="Time out"
              value={timeOut}
              onChange={(e) => {
                setTimeOut(e.target.value);
                if (e.target.value) onCheckout(staff.id, e.target.value);
              }}
            />
            <button className={"btn" + (record?.time_out ? " on checkedout" : "")} onClick={() => onCheckout(staff.id, timeOut)} title="Record what time this person left">
              {record?.time_out ? "Checked out" : "Check out"}
            </button>
          </>
        )}
        {record && (
          <button className="btn btn-ghost btn-x" title="Clear" aria-label="Clear" onClick={() => onClear(staff.id)}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================== History ============================== */
function HistoryTab({ history, onJump }: { history: HistoryRow[]; onJump: (date: string) => void }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Attendance history</h2>
        <span className="hint">Click any day to view or edit it</span>
      </div>
      {history.length === 0 ? (
        <div className="card-body">
          <div className="empty">
            <div className="big">📅</div>No attendance records yet.
          </div>
        </div>
      ) : (
        <div className="card-body table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Present</th>
                <th className="num">Late</th>
                <th className="num">Absent</th>
                <th className="num">Leave</th>
                <th className="num">Late %</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => {
                const dd = formatDisplay(h.date);
                const total = h.present_count + h.absent_count + h.leave_count;
                const latePct = total ? Math.round((h.late_count / total) * 100) : 0;
                return (
                  <tr key={h.date} className={"link-row" + (h.late_count > 0 ? " hot" : "")} onClick={() => onJump(h.date)}>
                    <td>
                      <strong>{dd.full}</strong>
                      <div className="role" style={{ color: "var(--muted)", fontSize: 11.5 }}>
                        {dd.dow}
                      </div>
                    </td>
                    <td className="num">{h.present_count}</td>
                    <td className="num" style={{ color: "var(--late-ink)", fontWeight: 600 }}>
                      {h.late_count}
                    </td>
                    <td className="num">{h.absent_count}</td>
                    <td className="num">{h.leave_count}</td>
                    <td className="num">{latePct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================== Staff ============================== */
function StaffTab({
  activeStaff,
  inactiveStaff,
  onAddOpen,
  onSetActive,
  onDeleteHard,
}: {
  activeStaff: StaffRow[];
  inactiveStaff: StaffRow[];
  onAddOpen: () => void;
  onSetActive: (id: number, active: boolean) => void;
  onDeleteHard: (id: number) => void;
}) {
  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Staff list</h2>
          <span className="hint">{activeStaff.length} active</span>
          <button className="btn btn-primary" onClick={onAddOpen}>
            + New staff
          </button>
        </div>
        <div className="card-body table-wrap">
          {activeStaff.length === 0 ? (
            <div className="empty">
              <div className="big">🧑‍💼</div>No staff members yet. Add one above.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="num">Days marked</th>
                  <th className="num">Present</th>
                  <th className="num">Late</th>
                  <th className="num">Absent</th>
                  <th className="num">Leave</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {activeStaff.map((s) => {
                  const latePct = s.total_marked_days ? Math.round((s.late_days / s.total_marked_days) * 100) : 0;
                  const chronic = s.total_marked_days >= 3 && latePct >= 25;
                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.name}</strong>
                        {chronic && <span className="late-tag">Frequently late</span>}
                        <div className="role" style={{ color: "var(--muted)", fontSize: 11.5 }}>
                          {s.designation}
                        </div>
                      </td>
                      <td className="num">{s.total_marked_days}</td>
                      <td className="num">{s.present_days}</td>
                      <td className="num" style={{ color: "var(--late-ink)" }}>
                        {s.late_days}
                        {s.total_marked_days ? ` (${latePct}%)` : ""}
                      </td>
                      <td className="num">{s.absent_days}</td>
                      <td className="num">{s.leave_days}</td>
                      <td style={{ textAlign: "right" }}>
                        <button className="btn btn-ghost" onClick={() => onSetActive(s.id, false)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {inactiveStaff.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Removed staff</h2>
            <span className="hint">Their history is preserved</span>
          </div>
          <div className="card-body table-wrap">
            <table>
              <tbody>
                {inactiveStaff.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                      <div className="role" style={{ color: "var(--muted)", fontSize: 11.5 }}>
                        {s.designation}
                      </div>
                    </td>
                    <td colSpan={4} style={{ textAlign: "right" }}>
                      <button className="btn" onClick={() => onSetActive(s.id, true)}>
                        Reactivate
                      </button>{" "}
                      <button className="btn btn-danger" onClick={() => onDeleteHard(s.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================== Modal ============================== */
function AddStaffModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (name: string, designation: string) => void }) {
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  return (
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>New staff member</h3>
        <div className="field">
          <label htmlFor="m-name">Name</label>
          <input
            id="m-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ahmed Khan"
            onKeyDown={(e) => e.key === "Enter" && onSubmit(name, designation)}
          />
        </div>
        <div className="field">
          <label htmlFor="m-role">Designation (optional)</label>
          <input id="m-role" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Sales Executive" />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => onSubmit(name, designation)}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================== Settings ============================== */
function SettingsTab({ settings, effectiveCutoff, onSave }: { settings: Settings; effectiveCutoff: string; onSave: (draft: Settings) => void }) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);

  return (
    <div className="card">
      <div className="card-head">
        <h2>Settings</h2>
        <span className="hint">Late cutoff and organization name</span>
      </div>
      <div className="card-body" style={{ padding: "6px 18px 20px" }}>
        <div className="form-row">
          <div className="field">
            <label htmlFor="f-org">Organization / shop name</label>
            <input id="f-org" value={draft.org_name} onChange={(e) => setDraft({ ...draft, org_name: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="f-cutoff">Late cutoff time</label>
            <input id="f-cutoff" type="time" value={draft.late_cutoff} onChange={(e) => setDraft({ ...draft, late_cutoff: e.target.value })} />
            <span className="help">Arriving after this time counts as Late</span>
          </div>
          <div className="field">
            <label htmlFor="f-grace">Grace minutes</label>
            <input
              id="f-grace"
              type="number"
              min={0}
              max={120}
              value={draft.grace_minutes}
              onChange={(e) => setDraft({ ...draft, grace_minutes: Number(e.target.value) })}
            />
            <span className="help">Allowance before an arrival counts as Late</span>
          </div>
        </div>
        <div className="help" style={{ marginBottom: 14 }}>
          Currently: anyone arriving after <strong>{fmt12(effectiveCutoff)}</strong> will be marked Late.
        </div>
        <button className="btn btn-primary" onClick={() => onSave(draft)}>
          Save settings
        </button>
      </div>
    </div>
  );
}
