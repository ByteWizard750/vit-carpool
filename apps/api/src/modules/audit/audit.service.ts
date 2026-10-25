import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, UserRole } from '@vit-carpool/db';

export interface LogAuditParams {
  actorId?: string | null;
  actorRole?: UserRole | null;
  action: string;
  targetType: string;
  targetId: string;
  changes?: Record<string, unknown> | Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Transactional append-only audit logger.
   * Accepts an optional Prisma transaction client (`tx`) to guarantee that
   * sensitive state transitions commit atomically with their audit records.
   */
  async log(params: LogAuditParams, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    try {
      await client.auditLog.create({
        data: {
          actorId: params.actorId ?? null,
          actorRole: params.actorRole ?? null,
          action: params.action,
          targetType: params.targetType,
          targetId: params.targetId,
          changes: (params.changes ?? {}) as Prisma.InputJsonValue,
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent ?? null,
        },
      });
      this.logger.log(
        `[Audit] Action=${params.action} Target=${params.targetType}:${params.targetId} Actor=${params.actorId ?? 'SYSTEM'}`,
      );
    } catch (error) {
      this.logger.error(
        `[AuditFailure] Failed to write audit log for action=${params.action}`,
        error,
      );
      throw error;
    }
  }
}
