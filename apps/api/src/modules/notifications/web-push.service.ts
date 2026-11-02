import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

@Injectable()
export class WebPushService implements OnModuleInit {
  private readonly logger = new Logger(WebPushService.name);
  private vapidConfigured = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const rawSubject = this.config.get<string>('VAPID_SUBJECT') || 'mailto:vitcarpool.app@gmail.com';
    const subject = rawSubject.trim().replace(/^["']|["']$/g, '');
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');

    if (publicKey && privateKey && subject) {
      try {
        webpush.setVapidDetails(subject, publicKey.trim(), privateKey.trim());
        this.vapidConfigured = true;
        this.logger.log('[WebPushService] VAPID details successfully configured');
      } catch (err: any) {
        this.logger.warn(`[WebPushService] Failed to configure VAPID details: ${err.message}`);
      }
    } else {
      this.logger.log('[WebPushService] VAPID keys not configured; running in fallback mode');
    }
  }

  getPublicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY')?.trim() || null;
  }

  isConfigured(): boolean {
    return this.vapidConfigured;
  }

  /**
   * Register or update a browser Web Push subscription for a user.
   */
  async registerSubscription(
    userId: string,
    subscription: { endpoint: string; p256dh: string; auth: string },
  ): Promise<void> {
    try {
      await this.prisma.webPushSubscription.upsert({
        where: {
          userId_endpoint: {
            userId,
            endpoint: subscription.endpoint,
          },
        },
        create: {
          userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
        update: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          updatedAt: new Date(),
        },
      });
      this.logger.debug(`[WebPush] Registered push subscription for user ${userId}`);
    } catch (err) {
      this.logger.warn(`[WebPush] Failed to store push subscription: ${err}`);
    }
  }

  /**
   * Disable/unsubscribe push notifications for a user device.
   */
  async unsubscribe(userId: string, endpoint: string): Promise<boolean> {
    try {
      await this.prisma.webPushSubscription.deleteMany({
        where: { userId, endpoint },
      });
      this.logger.debug(`[WebPush] Removed push subscription for user ${userId}`);
      return true;
    } catch (err) {
      this.logger.warn(`[WebPush] Failed to remove push subscription: ${err}`);
      return false;
    }
  }

  /**
   * Dispatch a Web Push notification to all active devices of a user.
   * Completely decoupled and resilient: failures or network timeouts never throw.
   */
  async sendPushNotification(userId: string, payload: WebPushPayload): Promise<boolean> {
    try {
      const subscriptions = await this.prisma.webPushSubscription.findMany({
        where: { userId },
      });

      if (subscriptions.length === 0) {
        return false;
      }

      this.logger.debug(
        `[WebPush] Dispatching push to ${subscriptions.length} device(s) for user ${userId}: "${payload.title}"`,
      );

      const stringPayload = JSON.stringify(payload);
      const expiredEndpoints: string[] = [];

      for (const sub of subscriptions) {
        if (this.vapidConfigured) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth,
                },
              },
              stringPayload,
              { timeout: 2500 },
            );
          } catch (err: any) {
            // Handle expired / unsubscribed browser tokens (HTTP 404 / 410 Gone)
            if (err.statusCode === 404 || err.statusCode === 410) {
              expiredEndpoints.push(sub.endpoint);
              this.logger.debug(`[WebPush] Device subscription expired (HTTP ${err.statusCode}) for user ${userId}`);
            } else {
              this.logger.warn(`[WebPush] Push dispatch error for user ${userId}: ${err.message}`);
            }
          }
        } else if (sub.endpoint.startsWith('http')) {
          // Fallback simulation for test environments without full VAPID keypairs
          try {
            await fetch(sub.endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: stringPayload,
              signal: AbortSignal.timeout(1500),
            }).catch(() => {});
          } catch {
            // Ignore simulated device failure
          }
        }
      }

      // Automatically prune expired 404/410 subscriptions from database
      if (expiredEndpoints.length > 0) {
        await this.prisma.webPushSubscription.deleteMany({
          where: {
            userId,
            endpoint: { in: expiredEndpoints },
          },
        });
      }

      return true;
    } catch (err) {
      this.logger.warn(`[WebPush] Push notification delivery failed for user ${userId}: ${err}`);
      return false;
    }
  }
}


