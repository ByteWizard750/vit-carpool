import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import { VerificationRequestStatus } from '@vit-carpool/db';
import * as fs from 'fs';

export interface PurgeResult {
  purgedCount: number;
  errorsCount: number;
}

/**
 * Automated Document Purge Service enforcing the 30-day post-review retention policy
 * for campus ID verification documents per institutional privacy guidelines.
 */
@Injectable()
export class VerificationPurgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VerificationPurgeService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private readonly defaultRetentionDays: number;
  private readonly isEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService,
  ) {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    // Disable automatic background timer in test environment to preserve test determinism
    this.isEnabled = nodeEnv !== 'test';
    // Default interval: 24 hours (configurable via VERIFICATION_PURGE_INTERVAL_MS)
    this.intervalMs = this.config.get<number>(
      'VERIFICATION_PURGE_INTERVAL_MS',
      24 * 60 * 60 * 1000,
    );
    // Default retention: 30 days (configurable via VERIFICATION_DOCUMENT_RETENTION_DAYS)
    this.defaultRetentionDays = this.config.get<number>(
      'VERIFICATION_DOCUMENT_RETENTION_DAYS',
      30,
    );
  }

  onModuleInit() {
    if (!this.isEnabled) {
      return;
    }

    this.timer = setInterval(() => {
      this.purgeExpiredDocuments().catch(() => {});
    }, this.intervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }

    this.logger.log(
      `[VerificationPurgeService] 30-day document purge job scheduled every ${
        this.intervalMs / 1000
      }s (retention: ${this.defaultRetentionDays} days)`,
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Safe, idempotent purge of verification proof documents whose review was completed
   * more than retentionDays ago.
   *
   * Invariants:
   * 1. Only terminal requests (APPROVED or REJECTED) are eligible.
   * 2. PENDING reviews are strictly excluded.
   * 3. Files already removed or missing are handled gracefully without aborting.
   * 4. Each successfully purged record writes an immutable audit log entry.
   */
  async purgeExpiredDocuments(
    customThresholdDate?: Date,
    customRetentionDays?: number,
  ): Promise<PurgeResult> {
    const retentionDays = customRetentionDays ?? this.defaultRetentionDays;
    const thresholdDate =
      customThresholdDate ??
      new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const eligibleRequests = await this.prisma.verificationRequest.findMany({
      where: {
        status: {
          in: [
            VerificationRequestStatus.APPROVED,
            VerificationRequestStatus.REJECTED,
          ],
        },
        reviewedAt: {
          lte: thresholdDate,
        },
        idCardDocumentPurgedAt: null,
      },
    });

    if (eligibleRequests.length === 0) {
      return { purgedCount: 0, errorsCount: 0 };
    }

    let purgedCount = 0;
    let errorsCount = 0;

    for (const req of eligibleRequests) {
      try {
        // Safely unlink physical file if path is specified and file exists on disk
        if (req.idCardDocumentPath) {
          try {
            if (fs.existsSync(req.idCardDocumentPath)) {
              await fs.promises.unlink(req.idCardDocumentPath);
            }
          } catch (fileErr: unknown) {
            const errCode = (fileErr as NodeJS.ErrnoException)?.code;
            if (errCode !== 'ENOENT') {
              this.logger.warn(
                `[VerificationPurgeService] Failed unlinking file ${req.idCardDocumentPath}: ${
                  (fileErr as Error).message
                }`,
              );
            }
          }
        }

        // Atomically update DB record and append immutable audit log
        await this.prisma.$transaction(async (tx) => {
          await tx.verificationRequest.update({
            where: { id: req.id },
            data: {
              idCardDocumentPurgedAt: new Date(),
              idCardDocumentPath: null,
            },
          });

          await this.audit.log(
            {
              actorId: null,
              actorRole: null,
              action: 'VERIFICATION_DOCUMENT_PURGED',
              targetType: 'VERIFICATION_REQUEST',
              targetId: req.id,
              changes: {
                previousPath: req.idCardDocumentPath ? '[REDACTED_PURGED]' : null,
                reviewedAt: req.reviewedAt?.toISOString() ?? null,
                status: req.status,
                retentionDays,
              },
            },
            tx,
          );
        });

        purgedCount++;
      } catch (err: unknown) {
        errorsCount++;
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(
          `[VerificationPurgeService] Failed to purge request ${req.id}: ${message}`,
        );
      }
    }

    this.logger.log(
      `[VerificationPurgeService] Document purge complete. Purged: ${purgedCount}, Errors: ${errorsCount}`,
    );

    return { purgedCount, errorsCount };
  }
}
