import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { JobType } from '@excelflow/shared';

@Injectable()
export class JobRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(workbookId: string, type: JobType) {
    return this.prisma['job'].create({
      data: { workbookId, type },
    });
  }

  async findById(id: string) {
    return this.prisma['job'].findUnique({ where: { id } });
  }

  async updateStatus(id: string, status: string, progress: number) {
    return this.prisma['job'].update({
      where: { id },
      data: { status, progress },
    });
  }

  async complete(id: string, result: unknown) {
    return this.prisma['job'].update({
      where: { id },
      data: { status: 'completed', progress: 100, result: result as object },
    });
  }

  async fail(id: string, error: string) {
    return this.prisma['job'].update({
      where: { id },
      data: { status: 'failed', error },
    });
  }

  async delete(id: string) {
    return this.prisma['job'].delete({ where: { id } });
  }
}
