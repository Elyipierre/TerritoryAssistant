export const CARRIER_GATEWAYS = {
  tmobile: { domain: '@tmomail.net', enabled: true, reliability: 'best_effort' },
  mint: { domain: '@tmomail.net', enabled: true, reliability: 'best_effort' },
  att: { domain: '@txt.att.net', enabled: false, reliability: 'unsupported' },
  cricket: { domain: '@txt.att.net', enabled: false, reliability: 'unsupported' },
  verizon: { domain: '@vtext.com', enabled: false, reliability: 'deprecated' },
  sprint: { domain: '@messaging.sprintpcs.com', enabled: false, reliability: 'legacy' },
  boost: { domain: '@sms.myboostmobile.com', enabled: false, reliability: 'unknown' },
  uscellular: { domain: '@email.uscc.net', enabled: false, reliability: 'unknown' }
};

export const CARRIER_OPTIONS = [
  ['tmobile', 'T-Mobile'],
  ['mint', 'Mint Mobile'],
  ['att', 'AT&T'],
  ['cricket', 'Cricket'],
  ['verizon', 'Verizon'],
  ['sprint', 'Sprint'],
  ['boost', 'Boost Mobile'],
  ['uscellular', 'U.S. Cellular']
];

export function normalizePhoneNumber(value = '') {
  return String(value).replace(/\D/g, '').slice(0, 10);
}

export function buildGatewayTarget(userRole) {
  const carrier = (userRole?.carrier || '').toLowerCase().trim();
  const phone = normalizePhoneNumber(userRole?.phone_number || '');
  if (!phone || phone.length !== 10) return null;
  const gateway = CARRIER_GATEWAYS[carrier];
  if (!gateway || !gateway.enabled) return null;
  return {
    target: `${phone}${gateway.domain}`,
    gatewayType: 'email_to_sms',
    reliability: gateway.reliability,
    domain: gateway.domain,
    carrier
  };
}

export function getCarrierGatewayStatus(userRole) {
  if (!userRole?.carrier) return 'unknown';
  const gateway = CARRIER_GATEWAYS[String(userRole.carrier).toLowerCase().trim()];
  if (!gateway) return 'unknown';
  if (!gateway.enabled) return gateway.reliability;
  return userRole?.sms_gateway_status || 'active';
}
