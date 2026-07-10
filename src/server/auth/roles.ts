export const ROLES = ["agent", "manager", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];

const ROLE_RANK: Record<Role, number> = {
  agent: 0,
  manager: 1,
  admin: 2,
  owner: 3,
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function normalizeRole(value: string | null | undefined): Role {
  return value && isRole(value) ? value : "agent";
}

export function hasMinimumRole(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
