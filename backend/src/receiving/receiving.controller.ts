import { Controller } from '@nestjs/common';
import { ReceivingService } from './receiving.service';

@Controller('receiving')
export class ReceivingController {
  constructor(private readonly receivingService: ReceivingService) {}
}
