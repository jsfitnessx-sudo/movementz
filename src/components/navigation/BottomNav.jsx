export function BottomNav({ activeTab, onTabChange, tabs }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {tabs.map((tab) => (
        <button
          className={tab.id === activeTab ? "nav-item active" : "nav-item"}
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          type="button"
        >
          <span className="nav-icon" aria-hidden="true">
            {tab.icon}
          </span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
