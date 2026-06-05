import { Inject, Injectable } from '@nestjs/common';

import {
  GEO_AREA_REPOSITORY,
  IGeoAreaRepository,
} from '../../domain/repositories/geo-area.repository.interface';

/** Lists the active divisions for the first cascading address selector (AC2). */
@Injectable()
export class ListDivisionsUseCase {
  constructor(
    @Inject(GEO_AREA_REPOSITORY) private readonly geo: IGeoAreaRepository,
  ) {}

  execute(): Promise<string[]> {
    return this.geo.listDivisions();
  }
}
