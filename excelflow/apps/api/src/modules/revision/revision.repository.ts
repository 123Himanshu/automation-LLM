import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '@prisma/client';
import type { ActionSource } from '@excelflow/shared';

interface CreateRevisionParams {
  workbookId: string;
  version: number;
  actions: Prisma.InputJsonValue;
  snapshot?: Prisma.InputJsonValue;
  source: ActionSource;
  description?: string;
}

@Injectable()
export class RevisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: CreateRevisionParams) {
    return this.prisma['revision'].create({ data: params });
  }

  async findLatest(workbookId: string) {
    return this.prisma['revision'].findFirst({
      where: { workbookId },
      orderBy: { version: 'desc' },
    });
  }

  async findByVersion(workbookId: string, version: number) {
    return this.prisma['revision'].findUnique({
      where: { workbookId_version: { workbookId, version } },
    });
  }

  async findById(id: string) {
    return this.prisma['revision'].findUnique({ where: { id } });
  }

  async findAll(workbookId: string) {
    return this.prisma['revision'].findMany({
      where: { workbookId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        source: true,
        description: true,
        createdAt: true,
      },
    });
  }

  async getNextVersion(workbookId: string): Promise<number> {
    const latest = await this.findLatest(workbookId);
    return latest ? latest.version + 1 : 0;
  }
}
