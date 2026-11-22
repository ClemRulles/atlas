import { OwnView } from "@/components/own/OwnView";
import { PageFrame } from "@/components/shell/PageFrame";

export const metadata = { title: "Ce que tu possèdes · Atlas" };

export default function OwnPage() {
  return (
    <PageFrame>
      <OwnView />
    </PageFrame>
  );
}
