import { LabView } from "@/components/lab/LabView";
import { PageFrame } from "@/components/shell/PageFrame";

export const metadata = { title: "Et si · Atlas" };

export default function WhatIfPage() {
  return (
    <PageFrame>
      <LabView />
    </PageFrame>
  );
}
