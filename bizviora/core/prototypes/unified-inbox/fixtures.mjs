// Synthetic fixtures only. Never substitute a real guest, booking, mailbox, or access token.
export const ACTORS={
  ownerA:{id:"operator-A",tenantId:"tenant-A",role:"owner"},
  staffA:{id:"staff-A",tenantId:"tenant-A",role:"staff"},
  ownerB:{id:"operator-B",tenantId:"tenant-B",role:"owner"}
};
export const BOOKINGS=[
  {id:"booking-A1",tenantId:"tenant-A",propertyId:"lavender-demo",customerId:"customer-1",provider:"Booking.com",providerBookingNumber:"D1042",checkIn:"2026-10-22",checkOut:"2026-10-25",sourceVerified:true,guest:"Khách A (demo)"},
  {id:"booking-A2",tenantId:"tenant-A",propertyId:"lavender-demo",customerId:"customer-1",provider:"Agoda",providerBookingNumber:"D2042",checkIn:"2026-12-10",checkOut:"2026-12-12",sourceVerified:true,guest:"Khách A (demo)"},
  {id:"booking-A3",tenantId:"tenant-A",propertyId:"lavender-demo",customerId:"customer-2",provider:"Booking.com",providerBookingNumber:"D3099",checkIn:"2026-10-22",checkOut:"2026-10-25",sourceVerified:true,guest:"Khách A (trùng tên - demo)"},
  {id:"booking-B1",tenantId:"tenant-B",propertyId:"property-B",customerId:"customer-B1",provider:"Booking.com",providerBookingNumber:"D1042",checkIn:"2026-10-22",checkOut:"2026-10-25",sourceVerified:true,guest:"Khách B (demo)"}
];
export const IDENTITIES=[
  {tenantId:"tenant-A",propertyId:"lavender-demo",channel:"WhatsApp",identityKey:"wa-verified-A",customerId:"customer-1",verified:true},
  {tenantId:"tenant-A",propertyId:"lavender-demo",channel:"Facebook",identityKey:"fb-verified-A",customerId:"customer-1",verified:true},
  {tenantId:"tenant-A",propertyId:"lavender-demo",channel:"Zalo",identityKey:"zalo-guest2",customerId:"customer-2",verified:true},
  {tenantId:"tenant-A",propertyId:"lavender-demo",channel:"Email",identityKey:"shared-email",customerId:"customer-1",verified:false},
  {tenantId:"tenant-B",propertyId:"property-B",channel:"WhatsApp",identityKey:"wa-verified-A",customerId:"customer-B1",verified:true}
];
export const DATA={bookings:BOOKINGS,identities:IDENTITIES,messages:[
  {id:"m1",tenantId:"tenant-A",propertyId:"lavender-demo",bookingId:"booking-A1",channel:"Booking.com",direction:"INBOUND",time:"2026-10-22T02:10:00Z",text:"Tôi sẽ đến vào khoảng 9 giờ tối.",status:"OTA_NATIVE",providerThreadId:"thread-demo-1",providerMessageId:"ota-demo-1"},
  {id:"m2",tenantId:"tenant-A",propertyId:"lavender-demo",bookingId:"booking-A1",channel:"WhatsApp",direction:"INBOUND",time:"2026-10-22T02:45:00Z",text:"Sáng mai có thể thuê xe máy không?",status:"VERIFIED_CONTACT",providerMessageId:"wa-demo-2"},
  {id:"m3",tenantId:"tenant-A",propertyId:"lavender-demo",bookingId:"booking-A1",channel:"WhatsApp",direction:"OUTBOUND",time:"2026-10-22T02:49:00Z",text:"Chúng tôi sẽ kiểm tra xe còn sẵn và xác nhận trước khi đặt.",status:"DEMO_REPLY",actor:"Nhân viên"},
  {id:"m4",tenantId:"tenant-A",propertyId:"lavender-demo",bookingId:"booking-A1",channel:"Email",direction:"INBOUND",time:"2026-10-22T03:20:00Z",text:"Can we have vegetarian breakfast tomorrow?",status:"EMAIL_INBOUND",providerMessageId:"email-demo-4"},
  {id:"m5",tenantId:"tenant-A",propertyId:"lavender-demo",bookingId:"booking-A1",channel:"Facebook",direction:"INBOUND",time:"2026-10-22T04:05:00Z",text:"Can you share the location?",status:"IDENTITY_VERIFIED",providerMessageId:"fb-demo-5"},
  {id:"m6",tenantId:"tenant-A",propertyId:"lavender-demo",bookingId:"booking-A1",channel:"Email",direction:"OUTBOUND",time:"2026-10-22T04:10:00Z",text:"Đã chuẩn bị dự thảo trả lời; OTA chưa xác nhận đồng bộ.",status:"EMAIL_SENT_UNVERIFIED",actor:"AI draft (demo)"},
  {id:"m7",tenantId:"tenant-A",propertyId:"lavender-demo",bookingId:"booking-A2",channel:"Zalo",direction:"INBOUND",time:"2026-12-08T04:00:00Z",text:"Tôi muốn hỏi về lần lưu trú tháng 12.",status:"VERIFIED_CONTACT",providerMessageId:"zalo-demo-7"},
  {id:"m8",tenantId:"tenant-A",propertyId:"lavender-demo",bookingId:"booking-A3",channel:"Booking.com",direction:"INBOUND",time:"2026-10-22T05:00:00Z",text:"Một khách khác có cùng tên và ngày đến.",status:"OTA_NATIVE",providerMessageId:"ota-demo-8"},
  {id:"m9",tenantId:"tenant-B",propertyId:"property-B",bookingId:"booking-B1",channel:"Booking.com",direction:"INBOUND",time:"2026-10-22T05:30:00Z",text:"Đây là tin của doanh nghiệp B, không hiển thị cho A.",status:"OTA_NATIVE",providerMessageId:"ota-demo-B"},
  {id:"m10",tenantId:"tenant-A",propertyId:"lavender-demo",bookingId:null,channel:"Facebook",direction:"INBOUND",time:"2026-10-22T06:00:00Z",text:"Tôi tên A và đến hôm nay, giúp kiểm tra booking?",status:"MANUAL_REVIEW",providerMessageId:"fb-demo-10"}
]};
export const REVIEW_CASES=[
 {id:"case-provider",label:"Tin OTA có booking xác minh",tenantId:"tenant-A",propertyId:"lavender-demo",channel:"Booking.com",provider:"Booking.com",providerBookingNumber:"D1042",providerTrust:"AUTHENTICATED_PROVIDER",transport:"OTA_API"},
 {id:"case-wa",label:"WhatsApp: một khách có hai lần lưu trú",tenantId:"tenant-A",propertyId:"lavender-demo",channel:"WhatsApp",identityKey:"wa-verified-A"},
 {id:"case-name",label:"Facebook: chỉ trùng tên/ngày check-in",tenantId:"tenant-A",propertyId:"lavender-demo",channel:"Facebook",claimedName:"Khách A (demo)",claimedCheckIn:"2026-10-22"},
 {id:"case-claimed",label:"Email: khách tự khai booking D2042",tenantId:"tenant-A",propertyId:"lavender-demo",channel:"Email",claimedBookingNumber:"D2042"},
 {id:"case-email",label:"Email alias chưa xác minh",tenantId:"tenant-A",propertyId:"lavender-demo",channel:"Email",identityKey:"shared-email"}
];
