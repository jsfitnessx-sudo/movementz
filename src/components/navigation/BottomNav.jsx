import { useState } from "react";

export function BottomNav({ activeTab, onTabChange, tabs }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const visibleTabs = tabs.slice(0, 5);
  const overflowTabs = tabs.slice(5);
  const activeOverflowTab = overflowTabs.find((tab) => tab.id === activeTab);

  function selectTab(tabId) {
    setMoreOpen(false);
    onTabChange(tabId);
  }

  return (
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
      {overflowTabs.length ? (
        <div className="nav-more-wrap">
          {moreOpen ? (
            <div className="nav-more-menu" role="menu">
              {overflowTabs.map((tab) => (
                <button
                  className={tab.id === activeTab ? "active" : ""}
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  type="button"
                >
                  <span className="nav-icon" aria-hidden="true">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          ) : null}
          <button
            aria-expanded={moreOpen}
            className={activeOverflowTab ? "nav-item active" : "nav-item"}
            onClick={() => setMoreOpen((current) => !current)}
            type="button"
          >
            <span className="nav-icon" aria-hidden="true">
              {activeOverflowTab?.icon || "+"}
            </span>
            <span>{activeOverflowTab?.label || "More"}</span>
          </button>
        </div>
      ) : null}
    </nav>
  );
}
