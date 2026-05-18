import { AppError } from './app.error';

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', errors?: any) {
    super(message, 400, errors);
  }
}
