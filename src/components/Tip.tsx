import type { ReactNode } from "react";

// Tipp-Erklaerung (Forschungsbefund: "Erkl jede Zahl"):
// Klick/Tap oeffnet die Kurz-Erklaerung, damit Ziele nie wie Bugs wirken.
export default function Tip({ text, label }: { text: string; label?: ReactNode }) {
  return (
    <span className="tip" tabIndex={0}>
      {label ?? "?"}
      <span className="tipbox">{text}</span>
    </span>
  );
}
