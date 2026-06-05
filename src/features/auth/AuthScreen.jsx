export function AuthScreen({ onDemoLogin }) {
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <div className="brand-icon large">M</div>
          <h1>Movementz</h1>
          <p>Clean rebuild foundation</p>
        </div>

        <div className="auth-actions">
          <button type="button" onClick={() => onDemoLogin("normal_user")}>
            Preview User
          </button>
          <button type="button" onClick={() => onDemoLogin("client")}>
            Preview Client
          </button>
          <button type="button" onClick={() => onDemoLogin("coach")}>
            Preview Coach
          </button>
          <button type="button" onClick={() => onDemoLogin("admin")}>
            Preview Admin
          </button>
        </div>
      </section>
    </main>
  );
}
