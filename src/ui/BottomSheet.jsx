import { M } from "../styles/mobileTheme.js";

export default function BottomSheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(18,49,42,0.4)",
        zIndex: 50, animation: "scrimIn .2s ease",
      }} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 51, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <div onClick={(e) => e.stopPropagation()} style={{
          pointerEvents: "auto", width: "100%", maxWidth: 480, maxHeight: "86vh", overflow: "auto",
          background: M.sheetBg, borderRadius: "28px 28px 0 0", padding: "14px 18px 30px",
          animation: "sheetUp .3s cubic-bezier(.2,.9,.3,1)", boxShadow: "0 -12px 40px rgba(18,49,42,.2)",
        }}>
          <div style={{ width: 42, height: 5, borderRadius: 99, background: "#DDE6E0", margin: "0 auto 16px" }} />
          {children}
        </div>
      </div>
    </>
  );
}
