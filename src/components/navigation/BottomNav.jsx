import { useState } from "react";

export function BottomNav({ activeTab, onTabChange, tabs }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const preferredOverflowIds = new Set(["habits", "progress", "feed", "food", "mindset"]);
  const visibleTabs = tabs.filter((tab) => !preferredOverflowIds.has(tab.id)).slice(0, 5);
  const visibleIds = new Set(visibleTabs.map((tab) => tab.id));
  const overflowTabs = tabs.filter((tab) => !visibleIds.has(tab.id));
  const activeOverflowTab = overflowTabs.find((tab) => tab.id === activeTab);

  function selectTab(tabId) {
    setMoreOpen(false);
    onTabChange(tabId);
  }

  return (
    <>
      {overflowTabs.length ? (
        <div className={moreOpen ? "nav-floating-wrap open" : "nav-floating-wrap"}>
          {moreOpen ? (
            <div className="nav-floating-menu" role="menu">
              {overflowTabs.map((tab) => (
                <button
                  className={tab.id === activeTab ? "active" : ""}
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  type="button"
                >
                  <span>{tab.label}</span>
                  <span className="floating-icon" aria-hidden="true">{tab.icon}</span>
                </button>
              ))}
            </div>
          ) : null}
          <button
            aria-expanded={moreOpen}
            aria-label={moreOpen ? "Close more menu" : "Open more menu"}
            className={activeOverflowTab ? "nav-floating-trigger active" : "nav-floating-trigger"}
            onClick={() => setMoreOpen((current) => !current)}
            type="button"
          >
            {moreOpen ? "x" : "+"}
          </button>
        </div>
      ) : null}
      <nav className="bottom-nav" aria-label="Main navigation">
        {visibleTabs.map((tab) => (
          <button
            className={tab.id === activeTab ? "nav-item active" : "nav-item"}
            key={tab.id}
            onClick={() => selectTab(tab.id)}
            type="button"
          >
            <span className="nav-icon" aria-hidden="true">
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
