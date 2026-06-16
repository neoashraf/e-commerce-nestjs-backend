import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThanOrEqual, Repository } from 'typeorm';

import { CloudinaryService } from '../../shared/media/cloudinary.service';
import { LeadAttachmentEntity } from './entities/lead-attachment.entity';
import { LeadMessageEntity } from './entities/lead-message.entity';
import { LeadEntity } from './entities/lead.entity';
import { LeadStatus, LeadType, MessageDirection } from './leads.enums';
import { LeadReferenceService } from './lead-reference.service';
import { CAPTCHA_VERIFIER, ICaptchaVerifier } from './ports/captcha-verifier.port';
import { ILeadNotifier, LEAD_NOTIFIER } from './ports/lead-notifier.port';
import { IOrderRefResolver, ORDER_REF_RESOLVER } from './ports/order-ref-resolver.port';
import { SubmitLeadDto } from './dto/submit-lead.dto';
import {
  CustomerReplyResultDto,
  MyLeadListItemDto,
  MyLeadThreadDto,
  SubmitLeadResultDto,
  UploadAttachmentResultDto,
} from './dto/lead-responses';
import { Paginated } from '../../shared/dto/paginated';

/** Subset of a Multer file we rely on (avoids a hard @types/multer dependency). */
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB (§11, BR-LEAD-6)
const MAX_ATTACHMENTS = 5; // ≤ 5 files per claim (§11)
const DEDUPE_WINDOW_MS = 60_000; // double-submit guard (§12.5)

/**
 * Lead capture core (FR-LEAD-001–007, 020–021). Public submission (spam-protected, rate-limited upstream),
 * claim evidence upload, NOTIF acknowledgement, and the customer My-Enquiries list/thread/reply. Admin
 * inbox/reply/notes/handoff live in lead-inbox-be. Cross-module reads go through ports (NOTIF/ORD/CAPTCHA).
 */
@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    @InjectRepository(LeadEntity) private readonly leads: Repository<LeadEntity>,
    @InjectRepository(LeadMessageEntity) private readonly messages: Repository<LeadMessageEntity>,
    @InjectRepository(LeadAttachmentEntity)
    private readonly attachments: Repository<LeadAttachmentEntity>,
    private readonly references: LeadReferenceService,
    @Inject(LEAD_NOTIFIER) private readonly notifier: ILeadNotifier,
    @Inject(ORDER_REF_RESOLVER) private readonly orderRefs: IOrderRefResolver,
    @Inject(CAPTCHA_VERIFIER) private readonly captcha: ICaptchaVerifier,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // ── Submission ─────────────────────────────────────────────────────────────

  async submit(dto: SubmitLeadDto, customerId: string | null): Promise<SubmitLeadResultDto> {
    // Spam protection (FR-LEAD-006): honeypot must be empty; CAPTCHA must verify. §12.1 — blocked, not stored.
    if (dto.honeypot && dto.honeypot.trim().length > 0) {
      throw new BadRequestException({ code: 'SPAM_DETECTED', message: 'Submission rejected.' });
    }
    if (!(await this.captcha.verify(dto.captcha_token ?? null))) {
      throw new BadRequestException({ code: 'CAPTCHA_FAILED', message: 'CAPTCHA verification failed.' });
    }

    const isClaim = dto.type === LeadType.CLAIM_RETURN;
    const attachmentIds = dto.attachment_ids ?? [];

    // claim_return requires an order reference (FR-LEAD-004; 400).
    if (isClaim && !dto.order_reference) {
      throw new BadRequestException({
        code: 'ORDER_REFERENCE_REQUIRED',
        message: 'A claim/return enquiry requires an order reference.',
      });
    }
    // Attachments only for claims (BR-LEAD-6; 422).
    if (!isClaim && attachmentIds.length > 0) {
      throw new UnprocessableEntityException({
        code: 'ATTACHMENTS_NOT_ALLOWED',
        message: 'Attachments are accepted only for claim/return enquiries.',
      });
    }
    if (attachmentIds.length > MAX_ATTACHMENTS) {
      throw new BadRequestException({
        code: 'TOO_MANY_ATTACHMENTS',
        message: `At most ${MAX_ATTACHMENTS} attachments are allowed.`,
      });
    }

    // Dedupe double-submits (§12.5, edge case 5): same phone + message within a short window.
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
    const duplicate = await this.leads.findOne({
      where: { submitterPhone: dto.submitter_phone, message: dto.message, createdAt: MoreThanOrEqual(since) },
      order: { createdAt: 'DESC' },
    });
    if (duplicate) {
      return {
        reference: duplicate.reference,
        status: duplicate.status,
        acknowledgement_sent: true,
      };
    }

    // Resolve & link the order reference if it belongs to the submitter (FR-LEAD-003, §12.2 flag-not-fail).
    let orderId: string | null = null;
    if (dto.order_reference) {
      const match = await this.orderRefs.resolve({
        orderReference: dto.order_reference,
        submitterPhone: dto.submitter_phone,
        customerId,
      });
      orderId = match.matched ? match.orderId : null;
    }

    const reference = await this.references.next();
    const lead = await this.leads.save(
      this.leads.create({
        reference,
        type: dto.type,
        subject: dto.subject,
        message: dto.message,
        submitterName: dto.submitter_name,
        submitterPhone: dto.submitter_phone,
        submitterEmail: dto.submitter_email ?? null,
        customerId,
        orderId,
        orderReference: dto.order_reference ?? null,
        productId: dto.product_id ?? null,
        status: LeadStatus.NEW,
        source: dto.source,
      }),
    );

    if (isClaim && attachmentIds.length > 0) {
      await this.bindAttachments(lead.id, attachmentIds);
    }

    // Original inbound message opens the thread.
    await this.messages.save(
      this.messages.create({
        leadId: lead.id,
        direction: MessageDirection.INBOUND,
        body: dto.message,
        isInternalNote: false,
      }),
    );

    // Acknowledgement via NOTIF (FR-LEAD-005) — best-effort, never blocks the lead (NFR reliability).
    let acknowledgementSent = false;
    try {
      acknowledgementSent = await this.notifier.acknowledge({
        reference,
        type: lead.type,
        subjectName: lead.submitterName,
        phone: lead.submitterPhone,
        email: lead.submitterEmail,
      });
    } catch (err) {
      this.logger.warn(`Acknowledgement dispatch failed for ${reference}: ${(err as Error).message}`);
    }

    return { reference, status: lead.status, acknowledgement_sent: acknowledgementSent };
  }

  /** Validate referenced attachment ids and bind them to the lead. Unbound + existing only. */
  private async bindAttachments(leadId: string, attachmentIds: string[]): Promise<void> {
    const found = await this.attachments.find({
      where: { id: In(attachmentIds), leadId: IsNull() },
    });
    if (found.length !== attachmentIds.length) {
      throw new BadRequestException({
        code: 'INVALID_ATTACHMENT',
        message: 'One or more attachments are unknown or already linked.',
      });
    }
    await this.attachments.update({ id: In(attachmentIds) }, { leadId });
  }

  // ── Attachment upload ───────────────────────────────────────────────────────

  async uploadAttachment(file: UploadedFileLike | undefined): Promise<UploadAttachmentResultDto> {
    if (!file) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'A file is required.' });
    }
    const isImageOrVideo = /^(image|video)\//.test(file.mimetype);
    if (!isImageOrVideo) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_TYPE',
        message: 'Only image or video attachments are allowed.',
      });
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: 'Attachment exceeds the 10 MB limit.',
      });
    }

    const id = randomUUID();
    // Image vs. video → let Cloudinary store under the right resource type.
    const resourceType = file.mimetype.startsWith('video/') ? 'video' : 'image';
    const { url } = await this.cloudinary.upload({
      buffer: file.buffer,
      folder: 'lead-attachments',
      resourceType,
      publicId: id,
    });

    await this.attachments.save(
      this.attachments.create({
        id,
        leadId: null,
        url,
        contentType: file.mimetype,
        sizeBytes: file.size,
      }),
    );

    return { attachment_id: id, url, content_type: file.mimetype, size_bytes: file.size };
  }

  // ── My Enquiries (customer) ─────────────────────────────────────────────────

  async listMyLeads(customerId: string, page: number, limit: number): Promise<Paginated<MyLeadListItemDto>> {
    const [rows, total] = await this.leads.findAndCount({
      where: { customerId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const items = rows.map((l) => ({
      reference: l.reference,
      type: l.type,
      subject: l.subject,
      status: l.status,
      created_at: l.createdAt.toISOString(),
    }));
    return new Paginated(items, { page, limit, total });
  }

  async getMyThread(customerId: string, reference: string): Promise<MyLeadThreadDto> {
    const lead = await this.requireOwnLead(customerId, reference);
    const messages = await this.messages.find({
      where: { leadId: lead.id, isInternalNote: false },
      order: { createdAt: 'ASC' },
    });
    return {
      reference: lead.reference,
      type: lead.type,
      status: lead.status,
      order_reference: lead.orderReference,
      messages: messages.map((m) => ({
        direction: m.direction,
        body: m.body,
        created_at: m.createdAt.toISOString(),
      })),
    };
  }

  async replyToMyLead(customerId: string, reference: string, body: string): Promise<CustomerReplyResultDto> {
    const lead = await this.requireOwnLead(customerId, reference);
    await this.messages.save(
      this.messages.create({
        leadId: lead.id,
        direction: MessageDirection.INBOUND,
        body,
        isInternalNote: false,
      }),
    );
    // A customer reply reopens the lead (FR-LEAD-021, §12.6).
    lead.status = LeadStatus.OPEN;
    await this.leads.save(lead);
    return { reference: lead.reference, status: lead.status };
  }

  private async requireOwnLead(customerId: string, reference: string): Promise<LeadEntity> {
    const lead = await this.leads.findOne({ where: { reference, customerId } });
    if (!lead) {
      throw new NotFoundException({ code: 'LEAD_NOT_FOUND', message: `Enquiry ${reference} not found.` });
    }
    return lead;
  }
}
