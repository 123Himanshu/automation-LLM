import { Global, Module } from '@nestjs/common';
import { S3Service } from './s3.service';

/**
 * Global S3 module — ensures a single S3Service instance across the app.
 * Prevents duplicate S3Client connections when multiple modules need S3.
 */
@Global()
@Module({
  providers: [S3Service],
  exports: [S3Service],
})
export class S3Module {}
