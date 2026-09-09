"use client";

import { useState } from "react";
import type { LeadRow } from "@/lib/leads";
import ListTabs from "./ListTabs";
import LeadTable, { type ListConditions } from "./LeadTable";

export default function LeadsBoard({
  leads,
  assigneeOptions,
  canEditCallTracking = true,
}: {
  leads: LeadRow[];
  assigneeOptions: string[];
  canEditCallTracking?: boolean;
}) {
  const [preset, setPreset] = useState<ListConditions | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <ListTabs onSelect={setPreset} assigneeOptions={assigneeOptions} />
      <LeadTable
        key={JSON.stringify(preset)}
        leads={leads}
        presetFilter={preset}
        assigneeOptions={assigneeOptions}
        canEditCallTracking={canEditCallTracking}
      />
    </div>
  );
}
