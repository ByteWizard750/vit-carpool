import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Audience } from '@vit-carpool/db';

export interface ClassificationResult {
  isClassified: boolean;
  audience: Audience | null;
  ruleMatched: string | null;
}

@Injectable()
export class EmailClassifierService {
  private readonly logger = new Logger(EmailClassifierService.name);
  private readonly enabled: boolean;
  private readonly studentRegex: RegExp | null = null;
  private readonly facultyRegex: RegExp | null = null;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<boolean>('ENABLE_AUTOMATIC_EMAIL_CLASSIFICATION', false);
    const studentPattern = this.config.get<string>('STUDENT_EMAIL_REGEX');
    const facultyPattern = this.config.get<string>('FACULTY_EMAIL_REGEX');

    if (studentPattern) {
      this.studentRegex = new RegExp(studentPattern, 'i');
    }
    if (facultyPattern) {
      this.facultyRegex = new RegExp(facultyPattern, 'i');
    }

    this.logger.log(
      `[EmailClassifier] Automatic classification enabled=${this.enabled}`,
    );
  }

  /**
   * Evaluates an email address against institutional domain rules.
   * Fails safe: if disabled, unmatched, or ambiguous (matches both), returns null audience.
   */
  classify(email: string): ClassificationResult {
    const normalizedEmail = email.trim().toLowerCase();

    if (!this.enabled) {
      return {
        isClassified: false,
        audience: null,
        ruleMatched: null,
      };
    }

    const matchesStudent = this.studentRegex?.test(normalizedEmail) ?? false;
    const matchesFaculty = this.facultyRegex?.test(normalizedEmail) ?? false;

    // Ambiguity guard: If matches both rules, fail safe
    if (matchesStudent && matchesFaculty) {
      this.logger.warn(
        `[EmailClassifier] Email ${normalizedEmail} matched BOTH student and faculty rules. Failing safe to PENDING.`,
      );
      return {
        isClassified: false,
        audience: null,
        ruleMatched: 'AMBIGUOUS_MATCH',
      };
    }

    if (matchesStudent) {
      return {
        isClassified: true,
        audience: Audience.STUDENT,
        ruleMatched: 'STUDENT_EMAIL_REGEX',
      };
    }

    if (matchesFaculty) {
      return {
        isClassified: true,
        audience: Audience.FACULTY,
        ruleMatched: 'FACULTY_EMAIL_REGEX',
      };
    }

    return {
      isClassified: false,
      audience: null,
      ruleMatched: null,
    };
  }
}
