export type KiotVietOccupancyReportRow = {
  BranchId?: number | string;
  RoomDay?: number;
  UsageHour?: number;
  BookingHour?: number;
};

export function summarizeKiotVietOccupancyRows(
  rows: KiotVietOccupancyReportRow[],
  branches: Array<{id:string;name:string}>,
) {
  const sums=new Map<string,{roomDay:number;usageHour:number;bookingHour:number}>();
  for(const row of rows){
    const id=String(row.BranchId??""); if(!id) continue;
    const x=sums.get(id)??{roomDay:0,usageHour:0,bookingHour:0};
    x.roomDay+=Number(row.RoomDay??0)||0;
    x.usageHour+=Number(row.UsageHour??0)||0;
    x.bookingHour+=Number(row.BookingHour??0)||0;
    sums.set(id,x);
  }
  const branchRows=branches.map((b)=>{
    const x=sums.get(String(b.id))??{roomDay:0,usageHour:0,bookingHour:0};
    const usageRooms=x.usageHour/24, bookingRooms=x.bookingHour/24;
    return {id:String(b.id),name:b.name,roomDay:x.roomDay,usageRooms,bookingRooms,occupancy:x.roomDay>0?100*(usageRooms+bookingRooms)/x.roomDay:null};
  });
  const totalRoomDay=branchRows.reduce((n,b)=>n+b.roomDay,0);
  const totalOccupied=branchRows.reduce((n,b)=>n+b.usageRooms+b.bookingRooms,0);
  return {branches:branchRows,combined:totalRoomDay>0?100*totalOccupied/totalRoomDay:null};
}
