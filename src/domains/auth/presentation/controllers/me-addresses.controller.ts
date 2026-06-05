import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  AuthenticatedCustomer,
  CurrentCustomer,
} from '../../../../shared/decorators/current-customer.decorator';
import { Address } from '../../domain/entities/address.entity';
import { CreateAddressUseCase } from '../../application/use-cases/create-address.use-case';
import { DeleteAddressUseCase } from '../../application/use-cases/delete-address.use-case';
import { ListAddressesUseCase } from '../../application/use-cases/list-addresses.use-case';
import { UpdateAddressUseCase } from '../../application/use-cases/update-address.use-case';
import { CreateAddressDto } from '../dto/create-address.dto';
import { AddressResponseDto, CreateAddressResponseDto } from '../dto/address-response.dto';
import { UpdateAddressDto } from '../dto/update-address.dto';
import { JwtCustomerGuard } from '../guards/jwt-customer.guard';

/**
 * Customer address-book endpoints (FR-AUTH-050/051/052/053). All scoped to the authenticated
 * customer via {@link JwtCustomerGuard}; the delivery zone is resolved server-side via CART.
 */
@ApiTags('Auth')
@ApiBearerAuth()
@UseGuards(JwtCustomerGuard)
@Controller('me/addresses')
export class MeAddressesController {
  constructor(
    private readonly listAddresses: ListAddressesUseCase,
    private readonly createAddress: CreateAddressUseCase,
    private readonly updateAddress: UpdateAddressUseCase,
    private readonly deleteAddress: DeleteAddressUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the saved delivery addresses (default first)' })
  @ApiOkResponse({ type: AddressResponseDto, isArray: true })
  async list(
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ): Promise<AddressResponseDto[]> {
    const addresses = await this.listAddresses.execute({ customerId: customer.customerId });
    return addresses.map(toResponse);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a delivery address (zone resolved server-side)' })
  @ApiCreatedResponse({ type: CreateAddressResponseDto })
  @ApiBadRequestResponse({ description: 'Missing geo field or unserviceable area' })
  async create(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: CreateAddressDto,
  ): Promise<CreateAddressResponseDto> {
    const result = await this.createAddress.execute({
      customerId: customer.customerId,
      recipientName: dto.recipient_name,
      recipientPhone: dto.recipient_phone,
      addressLine: dto.address_line,
      area: dto.area,
      district: dto.district,
      division: dto.division,
      postalCode: dto.postal_code ?? null,
      isDefault: dto.is_default,
    });
    return { id: result.id, is_default: result.isDefault };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a saved address; setting is_default clears the prior default' })
  @ApiOkResponse({ type: AddressResponseDto })
  @ApiBadRequestResponse({ description: 'Unserviceable area or invalid field' })
  @ApiNotFoundResponse({ description: 'Address not found for this customer' })
  async update(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    const address = await this.updateAddress.execute({
      customerId: customer.customerId,
      addressId: id,
      recipientName: dto.recipient_name,
      recipientPhone: dto.recipient_phone,
      addressLine: dto.address_line,
      area: dto.area,
      district: dto.district,
      division: dto.division,
      postalCode: dto.postal_code,
      isDefault: dto.is_default,
    });
    return toResponse(address);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a saved address; the default is promoted to another address' })
  @ApiNoContentResponse({ description: 'Address removed' })
  @ApiNotFoundResponse({ description: 'Address not found for this customer' })
  async remove(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.deleteAddress.execute({ customerId: customer.customerId, addressId: id });
  }
}

/** Map the domain entity to the snake_case API response shape. */
function toResponse(a: Address): AddressResponseDto {
  return {
    id: a.id,
    recipient_name: a.recipientName,
    recipient_phone: a.recipientPhone,
    address_line: a.addressLine,
    area: a.area,
    district: a.district,
    division: a.division,
    postal_code: a.postalCode,
    delivery_zone: a.deliveryZone,
    is_default: a.isDefault,
  };
}
