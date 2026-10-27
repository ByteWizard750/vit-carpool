import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

/**
 * Periodic cleanup service for abandoned, expired OTP records.
 * Runs on a safe configurable interval without adding third-party cron dependencies.
 */
@Injectable()
export class OtpCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OtpCleanupService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private readonly isEnabled: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    // In test environment, the automated background interval is disabled by default to maintain test isolation.
    this.isEnabled = nodeEnv !== 'test';
    // Default interval: 30 minutes (configurable via OTP_CLEANUP_INTERVAL_MS)
    this.intervalMs = this.config.get<number>('OTP_CLEANUP_INTERVAL_MS', 30 * 60 * 1000);
  }

  onModuleInit() {
    if (!this.isEnabled) {
      return;
    }
    this.timer = setInterval(() => {
      this.runCleanup().catch(() => {});
    }, this.intervalMs);

    // Allow Node process to exit gracefully without timer hanging
    if (this.timer.unref) {
      this.timer.unref();
    }
    this.logger.log(`[OtpCleanupService] Periodic OTP cleanup scheduled every ${this.intervalMs / 1000}s`);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Execute cleanup run safely catching and sanitizing any database errors.
   */
  async runCleanup(): Promise<number> {
    try {
      const deletedCount = await this.authService.cleanupExpiredOtps();
      if (deletedCount > 0) {
        this.logger.log(`[OtpCleanupService] Pruned ${deletedCount} abandoned expired OTP records`);
      }
      return deletedCount;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`[OtpCleanupService] Failed to prune expired OTPs: ${message}`);
      return 0;
    }
  }
}
