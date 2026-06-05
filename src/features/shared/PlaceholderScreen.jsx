export function PlaceholderScreen({ role, tab }) {
  return (
    <section className="screen-stack">
      <div className="screen-heading">
        <p className="eyebrow">{role.replace("_", " ")}</p>
        <h1>{toTitle(tab)}</h1>
        <p>This screen is reserved in the rebuild map.</p>
      </div>
      <div className="panel">
        <h2>Planned screen</h2>
        <p>
          The structure is now in place. We will add this feature when its turn
          arrives in the rebuild roadmap.
        </p>
      </div>
    </section>
  );
}

function toTitle(value) {
  return value
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
