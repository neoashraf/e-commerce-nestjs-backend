import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { validateOrReject } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { StockMovementActorType } from '../domain/stock-movement-type';
import { JwtAdminGuard } from '../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../rbac/presentation/decorators/requires.decorator';
import {
  AuthenticatedAdmin,
  CurrentAdmin,
} from '../../rbac/presentation/decorators/current-admin.decorator';
import { BulkResult, BulkRow, BulkService } from '../application/bulk.service';
import { parseBulkCsv } from '../application/bulk-csv.parser';
import { BulkImportDto } from './dto/bulk-import.dto';
import { BulkResultDto } from './dto/bulk-result.dto';

/** Minimal shape of an uploaded file we depend on (avoids requiring @types/multer). */
interface UploadedCsv {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
  size?: number;
}

/** 2 MB cap on the synchronous CSV upload (MVP; very large files → async, an Open Q). */
const MAX_CSV_BYTES = 2 * 1024 * 1024;

/**
 * Bulk stock + threshold import (FR-INV-014; contract: Bulk update / import). One endpoint accepts
 * either a JSON body (`{ rows: [...] }`) or a multipart CSV upload (same columns); both normalize to
 * {@link BulkRow}s and run the continue-on-error apply in {@link BulkService}. Gated by the seeded
 * `inventory.stock.update` permission (the contract names it `inventory.stock.adjust`; aligning with the
 * mutate code the rest of the admin inventory controller uses — see the PR note).
 */
@ApiTags('Inventory — Admin')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/inventory')
export class BulkController {
  constructor(private readonly bulk: BulkService) {}

  @Post('bulk')
  @Requires('inventory.stock.update')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Bulk update stock + thresholds (JSON rows or multipart CSV; continue-on-error)',
  })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({ type: BulkImportDto })
  @ApiOkResponse({ type: BulkResultDto })
  @ApiBadRequestResponse({ description: 'No rows/file provided, malformed CSV, or invalid JSON rows' })
  async bulkUpdate(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() body: unknown,
    @UploadedFile() file?: UploadedCsv,
  ): Promise<BulkResult> {
    const rows = file ? this.rowsFromCsv(file) : await this.rowsFromJson(body);
    return this.bulk.bulkUpdate(rows, {
      type: StockMovementActorType.ADMIN,
      id: admin.adminId,
    });
  }

  private rowsFromCsv(file: UploadedCsv): BulkRow[] {
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({ code: 'INVALID_CSV', message: 'Uploaded file is empty.' });
    }
    if ((file.size ?? file.buffer.length) > MAX_CSV_BYTES) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `CSV exceeds the ${MAX_CSV_BYTES} byte limit; split it or use the async import (deferred).`,
      });
    }
    const rows = parseBulkCsv(file.buffer.toString('utf-8'));
    if (rows.length === 0) {
      throw new BadRequestException({ code: 'INVALID_CSV', message: 'CSV has no data rows.' });
    }
    return rows;
  }

  /**
   * Validate + normalize the JSON body. We validate manually here (not via the route DTO) because the
   * same endpoint also accepts multipart; an empty/missing `rows` array is a 400.
   */
  private async rowsFromJson(body: unknown): Promise<BulkRow[]> {
    const dto = plainToInstance(BulkImportDto, body ?? {});
    try {
      await validateOrReject(dto, { whitelist: true, forbidNonWhitelisted: true });
    } catch {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Provide a non-empty `rows` array (or upload a CSV file).',
      });
    }
    return dto.rows.map((r) => ({
      sku_code: r.sku_code,
      set_on_hand: r.set_on_hand,
      low_stock_threshold: r.low_stock_threshold,
      reason: r.reason,
    }));
  }
}
