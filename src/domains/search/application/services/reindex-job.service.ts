import { Injectable, Logger } from '@nestjs/common';

import { SearchIndexerService } from './search-indexer.service';

export interface ReindexJob {
  job_id: string;
  status: 'running' | 'completed' | 'failed';
}

/**
 * Async reindex job runner (FR-SRCH-072; contract: POST /admin/search/reindex → 202 {job_id,status}).
 * Kicks `SearchIndexerService.reindexAll()` in the background and returns immediately with a running job;
 * the storefront keeps serving the existing index until the rebuild's atomic swap commits (§12.9). Job
 * state is tracked in-memory (single-node MVP); a durable job store is a future upgrade (noted in PR).
 */
@Injectable()
export class ReindexJobService {
  private readonly logger = new Logger(ReindexJobService.name);
  private readonly jobs = new Map<string, ReindexJob>();
  private counter = 0;

  constructor(private readonly indexer: SearchIndexerService) {}

  /** Start a rebuild; return the running job descriptor synchronously (the work runs detached). */
  start(): ReindexJob {
    this.counter += 1;
    const job: ReindexJob = { job_id: `reindex_${this.counter}`, status: 'running' };
    this.jobs.set(job.job_id, job);

    void this.indexer
      .reindexAll()
      .then((count) => {
        job.status = 'completed';
        this.logger.log(`${job.job_id} completed (${count} documents).`);
      })
      .catch((err) => {
        job.status = 'failed';
        this.logger.error(`${job.job_id} failed: ${String(err)}`);
      });

    return job;
  }

  get(jobId: string): ReindexJob | undefined {
    return this.jobs.get(jobId);
  }
}
