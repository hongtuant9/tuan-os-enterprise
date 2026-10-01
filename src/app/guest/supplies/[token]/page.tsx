import { notFound } from "next/navigation";
import SuppliesRequestForm from "@/components/guest/SuppliesRequestForm";
import { findRoomSupplyContext } from "@/server/hospitality/room-supply-qr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GuestSuppliesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const room = findRoomSupplyContext(token);
  if (!room) notFound();

  return (
    <SuppliesRequestForm
      token={room.token}
      room={room.room}
      property={room.property}
    />
  );
}
