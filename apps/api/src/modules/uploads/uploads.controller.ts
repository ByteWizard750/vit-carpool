import {
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { UploadsService } from './uploads.service';
import { Public } from '../auth/decorators/public.decorator';
import * as path from 'path';

@ApiTags('uploads')
@Controller(['uploads', 'api/uploads'])
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Get(':category/:filename')
  @Public()
  @ApiOperation({ summary: 'Serve uploaded image (avatar or vehicle photo)' })
  async serveImage(
    @Param('category') category: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    // If S3 storage is enabled, redirect with a short-lived presigned URL
    if (this.uploadsService.isS3Configured) {
      const presignedUrl = await this.uploadsService.getPresignedUrl(category, filename);
      if (presignedUrl) {
        return res.redirect(302, presignedUrl);
      }
      // If presigned URL generation fails or object is local, fall through to local file check
    }

    // Local filesystem storage (and fallback for pre-existing local uploads)
    const filePath = this.uploadsService.resolveFilePath(category, filename);
    if (!filePath) {
      throw new NotFoundException('Image not found');
    }

    const ext = path.extname(filename).toLowerCase();
    let contentType = 'image/jpeg';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.webp') contentType = 'image/webp';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    res.sendFile(filePath);
  }
}
