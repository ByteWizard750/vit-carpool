/**
 * Web Push client utility for browser subscription management.
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    return reg;
  } catch (err) {
    console.warn('[WebPush] ServiceWorker registration failed:', err);
    return null;
  }
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export type PushActivationResult =
  | { success: true }
  | { success: false; reason: 'unsupported' | 'denied' | 'sw_failed' | 'server_failed' | 'network_error' };

export async function requestAndSubscribePush(token: string): Promise<boolean> {
  const result = await activateWebPush(token);
  return result.success;
}

export async function activateWebPush(token: string): Promise<PushActivationResult> {
  if (typeof window === 'undefined') {
    return { success: false, reason: 'unsupported' };
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { success: false, reason: 'unsupported' };
  }

  // If already explicitly denied by user/browser
  if (Notification.permission === 'denied') {
    return { success: false, reason: 'denied' };
  }

  // Request browser permission
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return { success: false, reason: 'denied' };
  }

  if (permission !== 'granted') {
    return { success: false, reason: 'denied' };
  }

  // Ensure Service Worker is active
  let reg = await registerServiceWorker();
  if (!reg) {
    try {
      reg = await navigator.serviceWorker.ready;
    } catch {
      return { success: false, reason: 'sw_failed' };
    }
  }

  if (!reg) {
    return { success: false, reason: 'sw_failed' };
  }

  try {
    // 1. Fetch backend VAPID public key
    const keyRes = await fetch('/api/notifications/push-public-key', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!keyRes.ok) return { success: false, reason: 'server_failed' };
    const { publicKey } = await keyRes.json();
    if (!publicKey) return { success: false, reason: 'server_failed' };

    // 2. Subscribe via PushManager
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as unknown as BufferSource,
    });

    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      return { success: false, reason: 'sw_failed' };
    }

    // 3. Post to backend
    const postRes = await fetch('/api/notifications/subscribe-push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        },
      }),
    });

    if (!postRes.ok) {
      return { success: false, reason: 'server_failed' };
    }

    return { success: true };
  } catch (err) {
    console.warn('[WebPush] Error during push subscription:', err);
    return { success: false, reason: 'network_error' };
  }
}

export async function unsubscribeFromPush(token: string): Promise<boolean> {
  const sub = await getExistingPushSubscription();
  if (!sub) return true;

  const endpoint = sub.endpoint;
  await sub.unsubscribe();

  await fetch('/api/notifications/unsubscribe-push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});

  return true;
}
