import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from '../src/modules/users/users.controller';
import { UsersService } from '../src/modules/users/users.service';
import { User, UserRole, VerificationStatus } from '@vit-carpool/db';
import { PublicUserProfileDto } from '@vit-carpool/contracts';

describe('Public User Profile Feature', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockViewer: User = {
    id: 'viewer-uuid-1',
    authUserId: 'auth-1',
    email: 'viewer@vitstudent.ac.in',
    fullName: 'Viewer Student',
    phoneNumber: '+919999999999',
    avatarUrl: null,
    audience: 'STUDENT',
    verificationStatus: VerificationStatus.VERIFIED,
    verificationMethod: null,
    verifiedAt: new Date(),
    role: UserRole.USER,
    isSuspended: false,
    suspensionReason: null,
    suspendedAt: null,
    suspendedBy: null,
    tokenVersion: 1,
    invalidatedBefore: null,
    authUpdatedAt: new Date(),
    adminMfaEnabled: false,
    adminMfaSecret: null,
    adminMfaVerifiedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const mockPublicProfile: PublicUserProfileDto = {
    id: 'target-uuid-2',
    fullName: 'Target Driver',
    avatarUrl: 'https://example.com/avatar.jpg',
    audience: 'STUDENT',
    verificationStatus: 'VERIFIED',
    memberSince: '2026-02-01T00:00:00.000Z',
    driverRating: {
      averageRating: 4.8,
      totalReviews: 12,
    },
    stats: {
      ridesOffered: 15,
      ridesCompleted: 4,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            getPublicProfile: jest.fn().mockResolvedValue(mockPublicProfile),
            mapToUserProfileDto: jest.fn(),
            updateProfile: jest.fn(),
            updateAvatar: jest.fn(),
            deleteAvatar: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  it('should return public profile with privacy invariants preserved', async () => {
    const result = await controller.getPublicProfile(mockViewer, 'target-uuid-2');

    expect(result).toBeDefined();
    expect(result.id).toBe('target-uuid-2');
    expect(result.fullName).toBe('Target Driver');
    expect(result.driverRating.averageRating).toBe(4.8);
    expect(result.stats.ridesOffered).toBe(15);

    // Strict privacy checks: Private fields must not exist
    expect((result as any).email).toBeUndefined();
    expect((result as any).phoneNumber).toBeUndefined();
    expect((result as any).authUserId).toBeUndefined();
    expect((result as any).isSuspended).toBeUndefined();
  });
});
