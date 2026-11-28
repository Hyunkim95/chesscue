import "./rook-character.css";

export function NetworkPill({ online }: { readonly online: boolean }) {
  return (
    <span
      className={`network-pill network-pill--${online ? "online" : "offline"}`}
    >
      <i aria-hidden="true" />
      {online ? "Online" : "Offline"}
    </span>
  );
}
