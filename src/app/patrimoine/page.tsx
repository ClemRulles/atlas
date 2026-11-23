import { PatrimoineView } from "@/components/me/PatrimoineView";
import { PageFrame } from "@/components/shell/PageFrame";

export const metadata = { title: "Mon patrimoine · Atlas" };

export default function PatrimoinePage() {
  return (
    <PageFrame>
      <PatrimoineView />
    </PageFrame>
  );
}
