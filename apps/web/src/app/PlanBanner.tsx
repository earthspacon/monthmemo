import { useUnit } from "effector-react";
import { Link } from "react-router-dom";

import { $me } from "../session/model";
import { Banner } from "../shared/ui";

// An ended free month blocks adding clients and approving reports, so every app page says so.
export const PlanBanner = () => {
  const { me } = useUnit({ me: $me });

  if (me?.agency.status !== "expired") {
    return null;
  }
  return (
    <div className="mb-4">
      <Banner tone="warning">
        Your free month ended. Subscribe on the{" "}
        <Link to="/app/billing" className="font-medium underline">
          billing page
        </Link>{" "}
        to add clients and approve reports.
      </Banner>
    </div>
  );
};
