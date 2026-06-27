import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Body for `POST /auth/google` — the Google Identity Services credential (an ID-token JWT). */
export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google Identity Services credential (the ID token returned by the Google button).',
    example: 'eyJhbGciOiJSUzI1Ni04...<google-id-token>',
  })
  @IsString()
  @IsNotEmpty()
  id_token: string;
}
