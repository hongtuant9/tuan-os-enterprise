import "server-only";

export type RoomSupplyContext = {
  token: string;
  room: string;
  property: "Lavender Homestay" | "Ruby Homestay";
};

const ROOMS: RoomSupplyContext[] = [
  { token: "3XvWtP75o_6y6Q8c", room: "101_La", property: "Lavender Homestay" },
  { token: "Ao_2vuVSPUFsIQd_", room: "102_La", property: "Lavender Homestay" },
  { token: "gKF-lfHJx8Z77FQq", room: "103_La", property: "Lavender Homestay" },
  { token: "4HkaLV8uIKKd_DUX", room: "104_La", property: "Lavender Homestay" },
  { token: "aBIb5qh-CjV6iMjL", room: "201_La", property: "Lavender Homestay" },
  { token: "tGtvbDOxkD_hXquo", room: "202_La", property: "Lavender Homestay" },
  { token: "dUHdJUraK6fG9XfW", room: "203_La", property: "Lavender Homestay" },
  { token: "RQsaW6VR7votnYjE", room: "101_Dobule", property: "Ruby Homestay" },
  { token: "77fxMLIc2CiJaCy8", room: "102_Double", property: "Ruby Homestay" },
  { token: "apiX9DST8fkqJqq-", room: "103_Twin", property: "Ruby Homestay" },
  { token: "1tL194RLmjDnoIPs", room: "104_Twin", property: "Ruby Homestay" },
  { token: "ZhID1r4LjhLFkulT", room: "105_Twin", property: "Ruby Homestay" },
  { token: "j5AyOc3TTKCAJg0f", room: "106_Twin", property: "Ruby Homestay" },
];

export function findRoomSupplyContext(token: string) {
  return ROOMS.find((item) => item.token === token) ?? null;
}

export function listRoomSupplyContexts() {
  return ROOMS.map((item) => ({ ...item }));
}
