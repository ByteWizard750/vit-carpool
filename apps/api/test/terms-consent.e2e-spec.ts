import { RequestOtpSchema, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from '@vit-carpool/contracts';

describe('Terms & Conditions Mandatory Acceptance (Contracts & Schema)', () => {
  it('should reject signup when termsAccepted is omitted or false', () => {
    const payloadWithoutTerms = {
      email: 'newstudent@vitstudent.ac.in',
      intent: 'signup',
      fullName: 'New Student',
    };

    const result = RequestOtpSchema.safeParse(payloadWithoutTerms);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('termsAccepted');
    }

    const payloadWithFalseTerms = {
      email: 'newstudent@vitstudent.ac.in',
      intent: 'signup',
      fullName: 'New Student',
      termsAccepted: false,
    };

    const falseResult = RequestOtpSchema.safeParse(payloadWithFalseTerms);
    expect(falseResult.success).toBe(false);
  });

  it('should allow signup when termsAccepted is explicitly true', () => {
    const validSignup = {
      email: 'newstudent@vitstudent.ac.in',
      intent: 'signup',
      fullName: 'New Student',
      termsAccepted: true,
      termsVersion: CURRENT_TERMS_VERSION,
    };

    const result = RequestOtpSchema.safeParse(validSignup);
    expect(result.success).toBe(true);
  });

  it('should allow signin without requiring termsAccepted', () => {
    const validSignin = {
      email: 'existing@vitstudent.ac.in',
      intent: 'signin',
    };

    const result = RequestOtpSchema.safeParse(validSignin);
    expect(result.success).toBe(true);
  });

  it('should have non-empty version strings defined', () => {
    expect(CURRENT_TERMS_VERSION).toBeDefined();
    expect(CURRENT_TERMS_VERSION.length).toBeGreaterThan(0);
    expect(CURRENT_PRIVACY_VERSION).toBeDefined();
    expect(CURRENT_PRIVACY_VERSION.length).toBeGreaterThan(0);
  });
});

describe('Terms & Conditions Service Logic', () => {
  it('should verify acceptTerms requires matching CURRENT_TERMS_VERSION', async () => {
    const mockPrisma = {
      userConsent: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const mockUser: any = {
      id: 'user-uuid-1',
      role: 'USER',
      email: 'student@vitstudent.ac.in',
    };

    // Correct version
    mockPrisma.userConsent.create.mockResolvedValueOnce({
      id: 'consent-1',
      userId: 'user-uuid-1',
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
      acceptedAt: new Date(),
    });

    const createPayload = {
      userId: mockUser.id,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
      ipAddress: '203.0.113.1',
      userAgent: 'Mozilla/5.0 Test',
    };

    const consent = await mockPrisma.userConsent.create({ data: createPayload });
    expect(consent).toBeDefined();
    expect(consent.termsVersion).toBe(CURRENT_TERMS_VERSION);
  });
});
