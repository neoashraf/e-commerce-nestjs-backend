import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { GeoArea } from '../../domain/entities/geo-area.entity';
import { ListAreasUseCase } from '../../application/use-cases/list-areas.use-case';
import { ListDistrictsUseCase } from '../../application/use-cases/list-districts.use-case';
import { ListDivisionsUseCase } from '../../application/use-cases/list-divisions.use-case';
import {
  GeoAreaDto,
  GeoAreaListResponseDto,
  GeoNameListResponseDto,
} from '../dto/geo-response.dto';
import { ListAreasQueryDto } from '../dto/list-areas-query.dto';
import { ListDistrictsQueryDto } from '../dto/list-districts-query.dto';

/**
 * Public cascading address selectors over the seeded BD geography (SRS 04 §5.6, FR-CART-044/046).
 * Unauthenticated — used by storefront address forms (AUTH FR-AUTH-050/051) for guests and
 * customers alike. Returns only `is_active` rows (AC2).
 */
@ApiTags('Cart — Geography')
@Controller('geo')
export class GeoController {
  constructor(
    private readonly listDivisions: ListDivisionsUseCase,
    private readonly listDistricts: ListDistrictsUseCase,
    private readonly listAreas: ListAreasUseCase,
  ) {}

  @Get('divisions')
  @ApiOperation({ summary: 'List divisions (FR-CART-044)' })
  @ApiOkResponse({ type: GeoNameListResponseDto })
  divisions(): Promise<string[]> {
    return this.listDivisions.execute();
  }

  @Get('districts')
  @ApiOperation({ summary: 'List districts within a division (FR-CART-044)' })
  @ApiOkResponse({ type: GeoNameListResponseDto })
  districts(@Query() query: ListDistrictsQueryDto): Promise<string[]> {
    return this.listDistricts.execute(query.division);
  }

  @Get('areas')
  @ApiOperation({ summary: 'List upazilas/thanas within a district, with their delivery zone (FR-CART-044/045)' })
  @ApiOkResponse({ type: GeoAreaListResponseDto })
  async areas(@Query() query: ListAreasQueryDto): Promise<GeoAreaDto[]> {
    const areas = await this.listAreas.execute(query.district);
    return areas.map(GeoController.toDto);
  }

  static toDto(a: GeoArea): GeoAreaDto {
    return {
      id: a.id,
      division: a.division,
      district: a.district,
      upazila: a.upazila,
      delivery_zone: a.deliveryZone,
      postal_code: a.postalCode,
    };
  }
}
