import ReferenceScreen from "@/components/tce/ReferenceScreens";
import { getTceTabLiveData } from "@/server/tce/tab-live-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const data = await getTceTabLiveData("settings");
  return <ReferenceScreen screen="settings" data={data} />;
}
