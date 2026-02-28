import { startTransition, useState } from "react";

import { ReportDeskContainer } from "./features/dashboard/containers/report-desk-container";
import { LandingExperience } from "./features/landing/components/landing-experience";

export default function App() {
  const [hasEntered, setHasEntered] = useState(false);

  const handleEnter = () => {
    startTransition(() => {
      setHasEntered(true);
    });
  };

  if (!hasEntered) {
    return <LandingExperience onEnter={handleEnter} />;
  }

  return (
    <div className="app-shell-enter">
      <ReportDeskContainer />
    </div>
  );
}
