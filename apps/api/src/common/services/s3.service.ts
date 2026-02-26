import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  type _Object,
} from '@aws-sdk/client-s3';
import type { Readable } from 'stream';

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private client!: S3Client;
  private bucket!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.bucket = this.config.getOrThrow<string>('S3_BUCKET');
    const region = this.config.getOrThrow<string>('S3_REGION');
    const endpoint = this.config.get<string>('S3_ENDPOINT');

    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: !!endpoint, // needed for MinIO / LocalStack
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
    });

    this.logger.log(`S3 client initialized — bucket: ${this.bucket}, region: ${region}`);
  }

  /** Upload a buffer to S3 */
  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    this.logger.debug(`Uploaded s3://${this.bucket}/${key} (${body.length} bytes)`);
  }

  /** Download an object from S3 as a Buffer */
  async download(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }

  /** Stream an object from S3 (for large file downloads) */
  async getStream(key: string): Promise<{ stream: Readable; contentLength: number }> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return {
      stream: response.Body as Readable,
      contentLength: response.ContentLength ?? 0,
    };
  }

  /** Delete a single object */
  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    this.logger.debug(`Deleted s3://${this.bucket}/${key}`);
  }

  /** List all objects under a prefix */
  async listByPrefix(prefix: string): Promise<string[]> {
    const objects = await this.listObjectsByPrefix(prefix);
    return objects.map((o) => o.Key).filter((k): k is string => !!k);
  }

  /** List all S3 objects (with metadata) under a prefix */
  private async listObjectsByPrefix(prefix: string): Promise<_Object[]> {
    const objects: _Object[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of response.Contents ?? []) {
        objects.push(obj);
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return objects;
  }

  /** Delete all objects under a prefix */
  async deleteByPrefix(prefix: string): Promise<number> {
    const keys = await this.listByPrefix(prefix);
    let deleted = 0;
    for (const key of keys) {
      await this.delete(key);
      deleted++;
    }
    if (deleted > 0) {
      this.logger.log(`Deleted ${deleted} objects under prefix "${prefix}"`);
    }
    return deleted;
  }

  /** Delete objects under a prefix that are older than the given cutoff date */
  async deleteByAge(prefix: string, cutoff: Date): Promise<number> {
    const objects = await this.listObjectsByPrefix(prefix);
    let deleted = 0;

    for (const obj of objects) {
      if (!obj.Key) continue;
      if (obj.LastModified && obj.LastModified < cutoff) {
        await this.delete(obj.Key);
        deleted++;
      }
    }

    return deleted;
  }
}
