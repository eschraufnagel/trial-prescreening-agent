import { useEffect, useState } from "react";
import { getInfo, type Info } from "./api.js";
import { ConversationView } from "./ConversationView.js";
import { modelLine, navOf, type Route, routeFrom } from "./logic.js";
import { ReviewPage } from "./ReviewPage.js";
import { ReviewsPage } from "./ReviewsPage.js";
import { ScreeningsPage } from "./ScreeningsPage.js";
import { SettingsPage } from "./SettingsPage.js";
import { TrialPage } from "./TrialPage.js";
import { TrialsPage } from "./TrialsPage.js";

const NAV = [
  { key: "trials", href: "#/", label: "Trials" },
  { key: "screenings", href: "#/screenings", label: "Screenings" },
  { key: "reviews", href: "#/reviews", label: "Reviews" },
  { key: "settings", href: "#/settings", label: "Settings" },
] as const;

/** The views, chosen from the URL hash, so a reload lands where it was and no router is needed. */
export function App() {
  const [route, setRoute] = useState<Route>(() => routeFrom(window.location.hash));
  const [info, setInfo] = useState<Info | undefined>();

  useEffect(() => {
    const onHash = () => setRoute(routeFrom(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Asked again on every view change, so a tab left open across a restart in
  // another mode doesn't keep the old mode's banner (slice 0013).
  // biome-ignore lint/correctness/useExhaustiveDependencies: route is the trigger, not an input
  useEffect(() => {
    getInfo().then(setInfo, () => setInfo(undefined));
  }, [route]);

  const current = navOf(route);

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <a href="#/" className="brand">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="brand-mark"
            >
              <path d="M9 3h6" />
              <path d="M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" />
              <path d="M7.5 14h9" />
            </svg>
            Trial Prescreening
          </a>
          <nav aria-label="Main" className="nav">
            {NAV.map((item) => (
              <a
                key={item.key}
                href={item.href}
                aria-current={current === item.key ? "page" : undefined}
              >
                {item.label}
              </a>
            ))}
          </nav>
          {info !== undefined && (
            <span className="pill">
              <span className="pill-dot" aria-hidden="true" />
              {modelLine(info)}
            </span>
          )}
        </div>
      </header>
      {/* A review says which agent made its own result; the app's mode does not. */}
      {info?.mode === "scripted" && route.page !== "review" && (
        <div className="banner">
          Scripted agent: not the real model. Answers yes, no, n/a or not sure are read literally.
        </div>
      )}
      {route.page === "trials" && <TrialsPage ready={info?.ready ?? true} />}
      {route.page === "trial" && <TrialPage nctId={route.nctId} />}
      {route.page === "screenings" && <ScreeningsPage />}
      {route.page === "reviews" && <ReviewsPage />}
      {route.page === "conversation" && <ConversationView id={route.id} />}
      {route.page === "review" && <ReviewPage id={route.id} />}
      {route.page === "settings" && (
        <SettingsPage onChanged={() => getInfo().then(setInfo, () => setInfo(undefined))} />
      )}
    </div>
  );
}
