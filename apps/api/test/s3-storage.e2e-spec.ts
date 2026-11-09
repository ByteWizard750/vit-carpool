import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UploadsService } from '../src/modules/uploads/uploads.service';
import { UploadsController } from '../src/modules/uploads/uploads.controller';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

// Minimal 1x1 transparent PNG buffer
const validPngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

// Minimal JPEG buffer
const validJpegBuffer = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xff, 0xd9,
]);

describe('AWS S3 Storage Driver & Controller Unit Tests', () => {
  describe('UploadsService - Local Storage Driver', () => {
    let service: UploadsService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UploadsService,
          {
            provide: ConfigService,
            useValue: {
              get: (key: string, defaultValue?: any) => {
                if (key === 'STORAGE_PROVIDER') return 'local';
                return defaultValue;
              },
            },
          },
        ],
      }).compile();

      service = module.get<UploadsService>(UploadsService);
    });

    it('identifies as local storage', () => {
      expect(service.storageType).toBe('local');
      expect(service.isS3Configured).toBe(false);
    });

    it('saves image locally and returns /uploads/avatars/ path', async () => {
      const mockFile = {
        buffer: validPngBuffer,
        mimetype: 'image/png',
      } as Express.Multer.File;

      const result = await service.saveImage('avatars', mockFile);
      expect(result).toMatch(/^\/uploads\/avatars\/avatars_[a-f0-9-]+\.png$/);

      // Clean up the created test file
      await service.deleteImage(result);
    });

    it('rejects invalid non-image file buffer', async () => {
      const mockFile = {
        buffer: Buffer.from('hello world not an image'),
        mimetype: 'text/plain',
      } as Express.Multer.File;

      await expect(service.saveImage('avatars', mockFile)).rejects.toThrow(
        'Unsupported file format',
      );
    });

    it('returns null for presigned URL in local mode', async () => {
      const url = await service.getPresignedUrl('avatars', 'test.png');
      expect(url).toBeNull();
    });
  });

  describe('UploadsService - AWS S3 Driver', () => {
    let service: UploadsService;
    let s3SendSpy: jest.SpyInstance;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UploadsService,
          {
            provide: ConfigService,
            useValue: {
              get: (key: string, defaultValue?: any) => {
                const config: Record<string, any> = {
                  STORAGE_PROVIDER: 's3',
                  S3_BUCKET_NAME: 'vit-carpool-prod-uploads-123456789012',
                  S3_REGION: 'ap-south-1',
                  AWS_ACCESS_KEY_ID: 'MOCK_KEY_ID',
                  AWS_SECRET_ACCESS_KEY: 'MOCK_SECRET_KEY',
                  S3_PRESIGNED_URL_EXPIRES_IN_SECONDS: 900,
                };
                return config[key] !== undefined ? config[key] : defaultValue;
              },
            },
          },
        ],
      }).compile();

      service = module.get<UploadsService>(UploadsService);
      s3SendSpy = jest.spyOn((service as any).s3Client, 'send').mockImplementation(async (command: any) => {
        return { $metadata: { httpStatusCode: 200 } };
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('identifies as S3 storage and is configured', () => {
      expect(service.storageType).toBe('s3');
      expect(service.isS3Configured).toBe(true);
    });

    it('uploads image to S3 bucket with correct key and ContentType', async () => {
      const mockFile = {
        buffer: validJpegBuffer,
        mimetype: 'image/jpeg',
      } as Express.Multer.File;

      const result = await service.saveImage('avatars', mockFile);
      expect(result).toMatch(/^\/uploads\/avatars\/avatars_[a-f0-9-]+\.jpg$/);

      expect(s3SendSpy).toHaveBeenCalledTimes(1);
      const command = s3SendSpy.mock.calls[0][0];
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input.Bucket).toBe('vit-carpool-prod-uploads-123456789012');
      expect(command.input.Key).toMatch(/^avatars\/avatars_[a-f0-9-]+\.jpg$/);
      expect(command.input.ContentType).toBe('image/jpeg');
      expect(command.input.Body).toEqual(validJpegBuffer);
    });

    it('deletes image from S3 bucket with DeleteObjectCommand', async () => {
      const testPath = '/uploads/vehicles/vehicles_abc123.png';
      await service.deleteImage(testPath);

      expect(s3SendSpy).toHaveBeenCalledTimes(1);
      const command = s3SendSpy.mock.calls[0][0];
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input.Bucket).toBe('vit-carpool-prod-uploads-123456789012');
      expect(command.input.Key).toBe('vehicles/vehicles_abc123.png');
    });

    it('generates presigned URL for secure access', async () => {
      const presignedUrl = await service.getPresignedUrl('avatars', 'avatars_test.png');
      expect(presignedUrl).toBeTruthy();
      expect(presignedUrl).toContain('https://vit-carpool-prod-uploads-123456789012.s3.ap-south-1.amazonaws.com/avatars/avatars_test.png');
      expect(presignedUrl).toContain('X-Amz-Signature=');
    });
  });

  describe('UploadsController - Redirection vs Local Serving', () => {
    let controller: UploadsController;
    let mockUploadsService: Partial<UploadsService>;

    beforeEach(async () => {
      mockUploadsService = {
        isS3Configured: false,
        getPresignedUrl: jest.fn(),
        resolveFilePath: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [UploadsController],
        providers: [
          {
            provide: UploadsService,
            useValue: mockUploadsService,
          },
        ],
      }).compile();

      controller = module.get<UploadsController>(UploadsController);
    });

    it('redirects 302 to presigned S3 URL when S3 is enabled', async () => {
      (mockUploadsService as any).isS3Configured = true;
      (mockUploadsService.getPresignedUrl as jest.Mock).mockResolvedValue(
        'https://s3.ap-south-1.amazonaws.com/test-bucket/avatars/test.jpg?X-Amz-Signature=xyz',
      );

      const mockRes = {
        redirect: jest.fn(),
      } as unknown as Response;

      await controller.serveImage('avatars', 'test.jpg', mockRes);
      expect(mockUploadsService.getPresignedUrl).toHaveBeenCalledWith('avatars', 'test.jpg');
      expect(mockRes.redirect).toHaveBeenCalledWith(
        302,
        'https://s3.ap-south-1.amazonaws.com/test-bucket/avatars/test.jpg?X-Amz-Signature=xyz',
      );
    });

    it('serves local file with headers when S3 is disabled', async () => {
      (mockUploadsService as any).isS3Configured = false;
      const testFilePath = '/path/to/uploads/avatars/test.jpg';
      (mockUploadsService.resolveFilePath as jest.Mock).mockReturnValue(testFilePath);

      const mockRes = {
        setHeader: jest.fn(),
        sendFile: jest.fn(),
      } as unknown as Response;

      await controller.serveImage('avatars', 'test.jpg', mockRes);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=86400');
      expect(mockRes.sendFile).toHaveBeenCalledWith(testFilePath);
    });
  });
});
