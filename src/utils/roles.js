// ---------------------------------------------------------------------------
// Role helpers. 'Facilitator' is the full role (schedule + session records).
// The three programme-specific facilitator roles below only do attendance and
// uploads -- Schedule and Sessions (PSR) are not applicable to them.
// ---------------------------------------------------------------------------
export const NO_SESSION_ROLES = ['BLP Facilitator', 'LTS Facilitator', 'Other Facilitator'];
export const ROLE_OPTIONS = ['Facilitator', ...NO_SESSION_ROLES, 'Admin'];

// True for 'Facilitator' and the three roles above (anyone who marks
// attendance in the field).
export function isFacilitatorRole(role) {
  return role === 'Facilitator' || NO_SESSION_ROLES.includes(role);
}

// True when Schedule and Sessions (PSR) apply to this role.
export function usesSessions(role) {
  return role === 'Facilitator';
}
