import { Inject, Injectable } from '@nestjs/common';

import {
  GEO_AREA_REPOSITORY,
  IGeoAreaRepository,
} from '../../domain/repositories/geo-area.repository.interface';

/** Lists the active districts within a division (second cascading selector, AC2). */
@Injectable()
export class ListDistrictsUseCase {
  constructor(
    @Inject(GEO_AREA_REPOSITORY) private readonly geo: IGeoAreaRepository,
  ) {}

  execute(division: string): Promise<string[]> {
    return this.geo.listDistricts(division);
  }
}
