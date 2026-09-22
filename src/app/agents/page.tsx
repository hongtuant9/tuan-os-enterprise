import ReferenceScreen from "@/components/tce/ReferenceScreens";
import { getTceTabLiveData } from "@/server/tce/tab-live-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const data = await getTceTabLiveData("agents", params);
  return <ReferenceScreen screen="agents" data={data} />;
}
