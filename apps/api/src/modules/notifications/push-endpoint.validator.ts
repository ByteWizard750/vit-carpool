import { BadRequestException } from '@nestjs/common';

/**
 * Whitelist of authoritative browser Web Push service gateway domains.
 * All legitimate Web Push subscriptions originate from these browser vendor push servers.
 */
const ALLOWED_PUSH_DOMAINS = [
  'fcm.googleapis.com',
  'push.apple.com',
  'push.services.mozilla.com',
  'notify.windows.com',
];

/**
 * Validates a browser Web Push subscription endpoint URL against SSRF vulnerabilities.
 * Enforces HTTPS, blocks internal/link-local/metadata IPs, and restricts domains to
 * authorized browser push services.
 */
export function validatePushEndpoint(endpointStr: unknown): string {
  if (typeof endpointStr !== 'string' || !endpointStr.trim()) {
    throw new BadRequestException('Push endpoint is required and must be a valid URL string');
  }

  const trimmed = endpointStr.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new BadRequestException('Push endpoint is not a valid URL');
  }

  // 1. Enforce HTTPS protocol strictly
  if (url.protocol !== 'https:') {
    throw new BadRequestException('Push endpoint must use secure https protocol');
  }

  // 2. Reject credentials in URL
  if (url.username || url.password) {
    throw new BadRequestException('Push endpoint must not contain user credentials');
  }

  // 3. Reject non-standard ports
  if (url.port && url.port !== '443') {
    throw new BadRequestException('Push endpoint must use standard HTTPS port (443)');
  }

  const hostname = url.hostname.toLowerCase();

  // 4. Reject IP literals (IPv4 or IPv6), localhost, and local resolution domains
  const isIpv4 = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname);
  const isIpv6 = hostname.includes(':') || /^\[?[a-fA-F0-9:]+\]?$/.test(hostname);
  if (
    isIpv4 ||
    isIpv6 ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new BadRequestException(
      'Push endpoint hostname cannot be an IP address or internal network domain',
    );
  }

  // 5. Restrict allowed hostnames to authorized push vendor gateway domains
  const isAuthorized = ALLOWED_PUSH_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );

  if (!isAuthorized) {
    throw new BadRequestException(
      `Push endpoint host "${hostname}" is not an authorized browser push service`,
    );
  }

  return trimmed;
}
