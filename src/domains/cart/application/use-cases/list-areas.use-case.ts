import { Inject, Injectable } from '@nestjs/common';

import { GeoArea } from '../../domain/entities/geo-area.entity';
import {
  GEO_AREA_REPOSITORY,
  IGeoAreaRepository,
} from '../../domain/repositories/geo-area.repository.interface';

/** Lists the active areas (upazilas/thanas) within a district (third cascading selector, AC2). */
@Injectable()
export class ListAreasUseCase {
  constructor(
    @Inject(GEO_AREA_REPOSITORY) private readonly geo: IGeoAreaRepository,
  ) {}

  execute(district: string): Promise<GeoArea[]> {
    return this.geo.listAreas(district);
  }
}
