const ACCESS_REQUESTS_KEY = 'territory-assistant-access-requests';
const APPROVED_PROFILES_KEY = 'territory-assistant-approved-profiles';
const OPERATIONAL_SETTINGS_KEY = 'territory-assistant-operational-settings';

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getAccessRequests() {
  return readJson(ACCESS_REQUESTS_KEY, []);
}

export function addAccessRequest(request) {
  const current = getAccessRequests();
  const existing = current.find((entry) => entry.user_id === request.user_id || entry.email === request.email);
  if (existing) return current;
  const next = [{
    id: `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    requested_at: new Date().toISOString(),
    status: 'pending',
    requested_role: 'Publisher',
    ...request
  }, ...current];
  writeJson(ACCESS_REQUESTS_KEY, next);
  return next;
}

export function updateAccessRequestStatus(userIdOrEmail, patch) {
  const current = getAccessRequests();
  const next = current.map((entry) =>
    entry.user_id === userIdOrEmail || entry.email === userIdOrEmail
      ? { ...entry, ...patch, updated_at: new Date().toISOString() }
      : entry
  );
  writeJson(ACCESS_REQUESTS_KEY, next);
  return next;
}

export function getApprovedProfiles() {
  return readJson(APPROVED_PROFILES_KEY, {});
}

export function getApprovedProfile(user) {
  if (!user) return null;
  const profiles = getApprovedProfiles();
  return profiles[user.id] || profiles[user.email] || null;
}

export function saveApprovedProfile(profile) {
  const current = getApprovedProfiles();
  const next = {
    ...current,
    [profile.user_id]: profile,
    ...(profile.email ? { [profile.email]: profile } : {})
  };
  writeJson(APPROVED_PROFILES_KEY, next);
  return next;
}

export function removeApprovedProfile(userIdOrEmail) {
  const current = getApprovedProfiles();
  const next = { ...current };
  Object.keys(next).forEach((key) => {
    if (key === userIdOrEmail || next[key]?.user_id === userIdOrEmail || next[key]?.email === userIdOrEmail) {
      delete next[key];
    }
  });
  writeJson(APPROVED_PROFILES_KEY, next);
  return next;
}

const defaultSettings = {
  telephoneWitnessingEnabled: true,
  telephoneWindowStart: '09:00',
  telephoneWindowEnd: '20:00',
  letterWritingEnabled: true,
  letterWritingWindowStart: '00:00',
  letterWritingWindowEnd: '23:59',
  expirationAlertDay1: 113,
  expirationAlertDay2: 119,
  expirationAlertDay3: 120,
  expirationChannels: ['email', 'in_app'],
  emailToTextFallbackEnabled: true,
  disableFailingGateways: true,
  coVisitModeEnabled: false,
  coVisitStart: '',
  coVisitEnd: '',
  coRestrictTelephone: false,
  coForceInitialCalls: true,
  automationNotes: 'Operational windows are enforced in the publisher workflow and surfaced in the command center.',
  notes: 'Operational windows are enforced in the publisher workflow and surfaced in the command center.'
};

export function getOperationalSettings() {
  return {
    ...defaultSettings,
    ...readJson(OPERATIONAL_SETTINGS_KEY, {})
  };
}

export function saveOperationalSettings(settings) {
  const next = { ...getOperationalSettings(), ...settings, updated_at: new Date().toISOString() };
  writeJson(OPERATIONAL_SETTINGS_KEY, next);
  return next;
}


const PDF_CALIBRATION_KEY = 'territory-assistant-pdf-calibration';

const defaultPdfCalibration = {
  s12OffsetX: 0,
  s12OffsetY: 0,
  s13OffsetX: 0,
  s13OffsetY: 0,
  s12MapOffsetX: 0,
  s12MapOffsetY: 0,
  s12MapScale: 1,
  s13RowNudge: 0
};

export function getPdfCalibration() {
  return {
    ...defaultPdfCalibration,
    ...readJson(PDF_CALIBRATION_KEY, {})
  };
}

export function savePdfCalibration(calibration) {
  const next = { ...getPdfCalibration(), ...calibration, updated_at: new Date().toISOString() };
  writeJson(PDF_CALIBRATION_KEY, next);
  return next;
}
