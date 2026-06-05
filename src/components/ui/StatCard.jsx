export function StatCard({ label, tone = "teal", value }) {
  return (
    <article className={`stat-card ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}
