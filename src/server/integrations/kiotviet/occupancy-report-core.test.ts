import test from "node:test";
import assert from "node:assert/strict";
import { summarizeKiotVietOccupancyRows } from "./occupancy-report-core.ts";

test("KiotViet occupancy formula matches official October report",()=>{
  const rows=[
    {BranchId:8992,RoomDay:217,UsageHour:28.458333333333332*24,BookingHour:54*24},
    {BranchId:9011,RoomDay:186,UsageHour:27.5*24,BookingHour:89*24},
  ];
  const x=summarizeKiotVietOccupancyRows(rows,[{id:"8992",name:"Lavender Homestay"},{id:"9011",name:"Ruby Homestay"}]);
  assert.equal(Number(x.branches[0].occupancy?.toFixed(2)),38.00);
  assert.equal(Number(x.branches[1].occupancy?.toFixed(2)),62.63);
  assert.equal(Number(x.combined?.toFixed(2)),49.37);
});

test("combined occupancy is weighted by RoomDay, not simple average",()=>{
  const x=summarizeKiotVietOccupancyRows([
    {BranchId:1,RoomDay:100,BookingHour:50*24,UsageHour:0},
    {BranchId:2,RoomDay:10,BookingHour:10*24,UsageHour:0},
  ],[{id:"1",name:"A"},{id:"2",name:"B"}]);
  assert.equal(Number(x.combined?.toFixed(2)),54.55);
});
