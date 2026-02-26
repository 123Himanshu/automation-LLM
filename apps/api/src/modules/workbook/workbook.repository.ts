import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { WorkbookClassification } from '@excelflow/shared';

interface CreateWorkbookParams {
  name: string;
  classification: WorkbookClassification;
  filePath: string;
  sheetCount: number;
  usedCells: number;
}

@Injectable()
export class WorkbookRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: CreateWorkbookParams) {
    return this.prisma['workbook'].create({ data: params });
  }

  async findById(id: string) {
    return this.prisma['workbook'].findUnique({ where: { id } });
  }

  async findAll() {
    return this.prisma['workbook'].findMany({
      where: {
        OR: [
          { filePath: '' },                          // empty workbooks (created via UI)
          { filePath: { startsWith: 'uploads/' } },  // S3-backed workbooks
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        classification: true,
        sheetCount: true,
        usedCells: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async delete(id: string) {
    return this.prisma['workbook'].delete({ where: { id } });
  }

  async updateFilePath(id: string, filePath: string) {
    return this.prisma['workbook'].update({
      where: { id },
      data: { filePath },
    });
  }

  async updateName(id: string, name: string) {
    return this.prisma['workbook'].update({
      where: { id },
      data: { name },
    });
  }
}
