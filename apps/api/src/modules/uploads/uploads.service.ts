import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type UploadCategory = 'avatars' | 'vehicles';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly baseUploadDir: string;
  private readonly storageProvider: 'local' | 's3';
  private readonly s3Client: S3Client | null = null;
  private readonly s3Bucket: string;
  private readonly presignedUrlExpiresIn: number;

  constructor(private readonly config?: ConfigService) {
    this.storageProvider = (this.config?.get<string>('STORAGE_PROVIDER') ||
      process.env.STORAGE_PROVIDER ||
      'local') as 'local' | 's3';
    this.baseUploadDir = process.env.UPLOADS_DIR
      ? path.resolve(process.env.UPLOADS_DIR)
      : path.resolve(process.cwd(), 'uploads');
    this.s3Bucket =
      this.config?.get<string>('S3_BUCKET_NAME') ||
      process.env.S3_BUCKET_NAME ||
      '';
    this.presignedUrlExpiresIn =
      Number(
        this.config?.get<number>('S3_PRESIGNED_URL_EXPIRES_IN_SECONDS') ||
          process.env.S3_PRESIGNED_URL_EXPIRES_IN_SECONDS,
      ) || 900;

    if (this.storageProvider === 's3' && this.s3Bucket) {
      const region =
        this.config?.get<string>('S3_REGION') ||
        process.env.S3_REGION ||
        'ap-south-1';
      const endpoint =
        this.config?.get<string>('S3_ENDPOINT') || process.env.S3_ENDPOINT;
      const forcePathStyle =
        (this.config?.get<string>('S3_FORCE_PATH_STYLE') ||
          process.env.S3_FORCE_PATH_STYLE) === 'true';
      const accessKeyId =
        this.config?.get<string>('AWS_ACCESS_KEY_ID') ||
        process.env.AWS_ACCESS_KEY_ID;
      const secretAccessKey =
        this.config?.get<string>('AWS_SECRET_ACCESS_KEY') ||
        process.env.AWS_SECRET_ACCESS_KEY;

      const clientConfig: any = {
        region,
        forcePathStyle,
      };
      if (endpoint) {
        clientConfig.endpoint = endpoint;
      }
      if (accessKeyId && secretAccessKey) {
        clientConfig.credentials = { accessKeyId, secretAccessKey };
      }

      this.s3Client = new S3Client(clientConfig);
      this.logger.log(
        `[UploadsService] Configured AWS S3 storage for bucket "${this.s3Bucket}" in ${region}`,
      );
    } else {
      // Ensure subdirectories exist for local storage
      for (const cat of ['avatars', 'vehicles']) {
        const dir = path.join(this.baseUploadDir, cat);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
      this.logger.log(
        `[UploadsService] Configured local disk storage at ${this.baseUploadDir}`,
      );
    }
  }

  get isS3Configured(): boolean {
    return this.storageProvider === 's3' && Boolean(this.s3Client && this.s3Bucket);
  }

  get storageType(): 'local' | 's3' {
    return this.storageProvider;
  }

  getUploadDir(category: UploadCategory): string {
    const dir = path.join(this.baseUploadDir, category);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Save an uploaded file buffer after validating image headers and mime types.
   * Max allowed size: 5MB.
   */
  async saveImage(
    category: UploadCategory,
    file: Express.Multer.File,
  ): Promise<string> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No image file provided');
    }

    // Size limit: 5MB
    const maxSizeBytes = 5 * 1024 * 1024;
    if (file.buffer.length > maxSizeBytes) {
      throw new BadRequestException('File size exceeds the 5MB limit');
    }

    // Determine extension from mime and validate magic bytes
    const ext = this.validateAndGetExtension(file.buffer, file.mimetype);
    const filename = `${category}_${crypto.randomUUID()}${ext}`;

    if (this.isS3Configured && this.s3Client) {
      const key = `${category}/${filename}`;
      let contentType = 'image/jpeg';
      if (ext === '.png') contentType = 'image/png';
      else if (ext === '.webp') contentType = 'image/webp';

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.s3Bucket,
          Key: key,
          Body: file.buffer,
          ContentType: contentType,
        }),
      );
      this.logger.log(
        `Saved ${category} upload to S3 bucket ${this.s3Bucket} key ${key} (${file.buffer.length} bytes)`,
      );
      return `/uploads/${category}/${filename}`;
    }

    const targetPath = path.join(this.getUploadDir(category), filename);
    await fs.promises.writeFile(targetPath, file.buffer);
    this.logger.log(
      `Saved ${category} upload to ${targetPath} (${file.buffer.length} bytes)`,
    );

    return `/uploads/${category}/${filename}`;
  }

  /**
   * Validate file buffer magic bytes against common image signatures.
   */
  private validateAndGetExtension(buffer: Buffer, mimetype: string): string {
    if (buffer.length < 4) {
      throw new BadRequestException('Invalid file format: file too small');
    }

    const isJpeg =
      buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;
    const isWebp =
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP';

    if (isJpeg) return '.jpg';
    if (isPng) return '.png';
    if (isWebp) return '.webp';

    // Fallback mime check if magic bytes signature passed partially
    if (mimetype === 'image/jpeg' || mimetype === 'image/jpg') return '.jpg';
    if (mimetype === 'image/png') return '.png';
    if (mimetype === 'image/webp') return '.webp';

    throw new BadRequestException(
      'Unsupported file format. Only JPEG, PNG, and WebP images are allowed.',
    );
  }

  /**
   * Delete an existing uploaded file from disk or S3 bucket.
   */
  async deleteImage(urlOrPath: string | null | undefined): Promise<void> {
    if (!urlOrPath || !urlOrPath.startsWith('/uploads/')) return;

    try {
      const parts = urlOrPath.replace(/^\/uploads\//, '').split('/');
      if (parts.length !== 2) return;

      const [category, filename] = parts;
      if (category !== 'avatars' && category !== 'vehicles') return;

      if (this.isS3Configured && this.s3Client) {
        const key = `${category}/${filename}`;
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: this.s3Bucket,
            Key: key,
          }),
        );
        this.logger.log(`Deleted S3 upload file: ${key}`);
      }

      // Also clean up any legacy local copy from disk during transition
      const cleanFilename = path.basename(filename);
      const filePath = path.join(this.baseUploadDir, category, cleanFilename);

      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        this.logger.log(`Deleted local upload file: ${filePath}`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not delete old upload: ${err.message}`);
    }
  }

  /**
   * Generate short-lived presigned URL for private S3 document access.
   */
  async getPresignedUrl(
    category: string,
    filename: string,
    expiresInSeconds?: number,
  ): Promise<string | null> {
    if (!this.isS3Configured || !this.s3Client) return null;
    if (category !== 'avatars' && category !== 'vehicles') return null;

    const safeFilename = path.basename(filename);
    const key = `${category}/${safeFilename}`;

    try {
      const command = new GetObjectCommand({
        Bucket: this.s3Bucket,
        Key: key,
      });

      return await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds || this.presignedUrlExpiresIn,
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to generate presigned S3 URL for ${key}: ${err.message}`,
      );
      return null;
    }
  }

  resolveFilePath(category: string, filename: string): string | null {
    if (category !== 'avatars' && category !== 'vehicles') return null;
    const safeFilename = path.basename(filename);
    const filePath = path.join(this.baseUploadDir, category, safeFilename);
    return fs.existsSync(filePath) ? filePath : null;
  }
}
