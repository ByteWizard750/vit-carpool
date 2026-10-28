import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecurringCommutesService } from './recurring-commutes.service';

/**
 * Background scheduler service for Recurring Commutes ride materialization.
 * Periodically extends the rolling 14-day window for all active commute schedules.
 */
@Injectable()
export class RecurringCommuteSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecurringCommuteSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private readonly isEnabled: boolean;
  private readonly horizonDays: number;
  private isRunning = false;

  constructor(
    private readonly commutesService: RecurringCommutesService,
    private readonly config: ConfigService,
  ) {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    // In test environment, the automated background interval is disabled by default to maintain test isolation.
    this.isEnabled = nodeEnv !== 'test';
    // Default interval: 1 hour (configurable via RECURRING_COMMUTE_INTERVAL_MS)
    this.intervalMs = this.config.get<number>('RECURRING_COMMUTE_INTERVAL_MS', 60 * 60 * 1000);
    // Configurable generation horizon: default 14 days
    this.horizonDays = this.config.get<number>('RECURRING_COMMUTE_HORIZON_DAYS', 14);
  }

  onModuleInit() {
    if (!this.isEnabled) {
      return;
    }

    this.timer = setInterval(() => {
      this.triggerGeneration().catch(() => {});
    }, this.intervalMs);

    // Allow Node process to exit gracefully without timer hanging
    if (this.timer.unref) {
      this.timer.unref();
    }

    this.logger.log(
      `[RecurringCommuteScheduler] Scheduled recurring ride materialization every ${
        this.intervalMs / 1000
      }s with ${this.horizonDays}-day horizon`,
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Execute materialization run safely catching errors and preventing overlapping executions.
   */
  async triggerGeneration(horizonDays = this.horizonDays): Promise<{
    totalSchedules: number;
    totalCreated: number;
    totalSkipped: number;
  }> {
    if (this.isRunning) {
      this.logger.warn('[RecurringCommuteScheduler] Generation run already in progress, skipping overlap.');
      return { totalSchedules: 0, totalCreated: 0, totalSkipped: 0 };
    }

    this.isRunning = true;
    try {
      const result = await this.commutesService.generateAllActiveCommutes(horizonDays);
      if (result.totalCreated > 0) {
        this.logger.log(
          `[RecurringCommuteScheduler] Materialized ${result.totalCreated} rides across ${result.totalSchedules} active schedules`,
        );
      }
      return result;
    } catch (err: unknown) {
      this.logger.error(
        `[RecurringCommuteScheduler] Materialization run failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { totalSchedules: 0, totalCreated: 0, totalSkipped: 0 };
    } finally {
      this.isRunning = false;
    }
  }
}
