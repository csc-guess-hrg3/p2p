import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { SignOptions } from 'jsonwebtoken';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LocalAuthService } from './local-auth.service';
import { StoreAuthService } from './store-auth.service';
import { LdapStrategy } from './strategies/ldap.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { CryptoModule } from '../common/crypto/crypto.module';

@Module({
  imports: [
    PassportModule,
    CryptoModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
            '8h') as SignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalAuthService,
    StoreAuthService,
    LdapStrategy,
    JwtStrategy,
  ],
  exports: [AuthService, LocalAuthService, StoreAuthService],
})
export class AuthModule {}
