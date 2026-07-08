import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { refreshEscalations, resolveDeferred } from "../lib/deferredPriorities.js";
import { COLORS } from "../styles/theme.js";

const SectionHeader = ({ children, count }) => (
  <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: COLORS.muted, marginBottom: 10 }}>
    {children} <span style={{ color: COLORS.accent }}>({count})</span>
  </div>
);

// ─── PRIORITIES TAB ──────────────────────────────────────────────────────────
export default function PrioritiesTab({ athleteId }) {
  const [items,            setItems]            = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [escalationBanner, setEscalationBanner] = useState([]);
  const [bannerDismissed,  setBannerDismissed]  = useState(false);

  const loadItems = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "athletes", athleteId, "deferredPriorities"));
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Failed to load deferred priorities:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!athleteId) return;
    (async () => {
      // Promote eligible items first, then load the list, so the list reflects
      // the post-escalation state (no active/escalated split-brain on first paint).
      try {
        const escalated = await refreshEscalations(athleteId);
        if (escalated.length > 0) setEscalationBanner(escalated);
      } catch (_) {}
      await loadItems();
    })();
  }, [athleteId]);

  const handleResolve = async (priority) => {
    try {
      await resolveDeferred(athleteId, priority);
      await loadItems();
    } catch (e) {
      console.error("Failed to resolve priority:", e);
    }
  };

  const toDate = ts => {
    if (!ts) return null;
    if (typeof ts.toDate === "function") return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    return new Date(ts);
  };

  const fmtDate = ts => {
    const d = toDate(ts);
    return d ? d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";
  };

  const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const active = items
    .filter(i => i.status === "active")
    .sort((a, b) => (b.weeksDeferredCount ?? 0) - (a.weeksDeferredCount ?? 0));

  const escalated = items.filter(i => i.status === "escalated");

  const resolved = items.filter(i => {
    if (i.status !== "resolved") return false;
    const d = toDate(i.addressedDate);
    return d && d >= cutoff30;
  });

  if (loading) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 32 }}>
        <div className="spinner" />
      </div>
    );
  }

  const isEmpty = active.length === 0 && escalated.length === 0 && resolved.length === 0;

  return (
    <div>
      {/* Escalation banner */}
      {!bannerDismissed && escalationBanner.length > 0 && (
        <div style={{ background: `${COLORS.red}18`, border: `1px solid ${COLORS.red}`, borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 700, color: COLORS.red, fontSize: "0.88rem", marginBottom: 6 }}>
              ⚠ {escalationBanner.length} priority item{escalationBanner.length !== 1 ? "s" : ""} newly escalated
            </div>
            {escalationBanner.map((e, i) => (
              <div key={i} style={{ fontSize: "0.82rem", color: COLORS.text }}>{e.priority}</div>
            ))}
          </div>
          <button onClick={() => setBannerDismissed(true)} style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", fontSize: "1.1rem", padding: "0 0 0 12px", lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="card" style={{ textAlign: "center", padding: "32px 20px" }}>
          <div style={{ fontSize: "1.8rem", marginBottom: 10 }}>✓</div>
          <div style={{ color: COLORS.muted, fontSize: "0.88rem" }}>
            No deferred priorities — all development areas are being addressed.
          </div>
        </div>
      )}

      {/* Group 1 — Active */}
      {active.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <SectionHeader count={active.length}>Active</SectionHeader>
          {active.map(item => (
            <div key={item.id} className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: "0.92rem", color: COLORS.text, flex: 1, marginRight: 10 }}>
                  {(item.weeksDeferredCount ?? 0) >= 3 && <span style={{ marginRight: 5 }}>⚠️</span>}
                  {item.priority}
                </div>
                <span style={{ fontSize: "0.7rem", background: `${COLORS.accent}18`, color: COLORS.accent, borderRadius: 20, padding: "3px 9px", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {item.weeksDeferredCount ?? 0} wk{(item.weeksDeferredCount ?? 0) !== 1 ? "s" : ""}
                </span>
              </div>
              {item.reason && (
                <div style={{ fontSize: "0.82rem", color: COLORS.muted, marginBottom: 5 }}>{item.reason}</div>
              )}
              {item.resolveCondition && (
                <div style={{ fontSize: "0.79rem", color: COLORS.muted, fontStyle: "italic", marginBottom: 5 }}>
                  Resolve when: {item.resolveCondition}
                </div>
              )}
              {item.targetWeek && (
                <div style={{ fontSize: "0.74rem", color: COLORS.muted, marginBottom: 10 }}>Target: {item.targetWeek}</div>
              )}
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: COLORS.accent, borderColor: COLORS.accentDim, fontSize: "0.78rem", marginTop: item.reason || item.resolveCondition || item.targetWeek ? 4 : 0 }}
                onClick={() => handleResolve(item.priority)}
              >
                ✓ Mark as Addressed
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Group 2 — Escalated */}
      {escalated.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div className="card" style={{ borderColor: COLORS.red, background: `${COLORS.red}08` }}>
            <div style={{ fontWeight: 700, color: COLORS.red, fontSize: "0.88rem", marginBottom: 12 }}>
              🚨 Needs Attention — Deferred 4+ Weeks
            </div>
            {escalated.map((item, i) => (
              <div key={item.id} style={{
                paddingBottom: i < escalated.length - 1 ? 12 : 0,
                marginBottom:  i < escalated.length - 1 ? 12 : 0,
                borderBottom:  i < escalated.length - 1 ? `1px solid ${COLORS.border}` : "none",
              }}>
                <div style={{ fontWeight: 700, fontSize: "0.88rem", color: COLORS.text, marginBottom: 4 }}>{item.priority}</div>
                <div style={{ fontSize: "0.76rem", color: COLORS.muted, marginBottom: 8 }}>
                  First deferred: {fmtDate(item.deferredDate)} · Escalated: {fmtDate(item.escalatedDate)}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: COLORS.accent, borderColor: COLORS.accentDim, fontSize: "0.78rem" }}
                  onClick={() => handleResolve(item.priority)}
                >
                  ✓ Mark as Addressed
                </button>
              </div>
            ))}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.red}33`, fontSize: "0.78rem", color: COLORS.red, fontStyle: "italic" }}>
              These development areas have not been trainable for 4+ consecutive weeks. Review whether the weekly schedule has capacity.
            </div>
          </div>
        </div>
      )}

      {/* Group 3 — Recently Resolved */}
      {resolved.length > 0 && (
        <div>
          <SectionHeader count={resolved.length}>Recently Resolved</SectionHeader>
          {resolved.map(item => (
            <div key={item.id} className="card" style={{ borderColor: `${COLORS.accent}40`, background: `${COLORS.accent}06`, marginBottom: 10, padding: "12px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ color: COLORS.accent, fontSize: "1.2rem", lineHeight: 1 }}>✓</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", color: COLORS.text }}>{item.priority}</div>
                  <div style={{ fontSize: "0.75rem", color: COLORS.muted, marginTop: 2 }}>Addressed {fmtDate(item.addressedDate)}</div>
                </div>
              </div>
            </div>
          ))}
          <div style={{ fontSize: "0.71rem", color: COLORS.muted, marginTop: 2 }}>Resolved items auto-archive after 30 days.</div>
        </div>
      )}
    </div>
  );
}
