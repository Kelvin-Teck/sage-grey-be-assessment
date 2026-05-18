import { Response } from 'express';
export { AppError } from '../errors/app.error';

interface SuccessResponse<T> {
  status: 'success';
  message: string;
  data?: T;
}

interface ErrorResponse {
  status: 'error';
  message: string;
  errors?: any;
}

export const sendSuccess = <T>(
  res: Response,
  statusCode: number,
  message: string,
  data?: T,
) => {
  const response: SuccessResponse<T> = {
    status: 'success',
    message,
    ...(data && { data }),
  };
  return res.status(statusCode).json(response);
};

export const sendError = (
  res: Response,
  statusCode: number,
  message: string,
  errors?: any,
) => {
  const response: ErrorResponse = {
    status: 'error',
    message,
    ...(errors && { errors }),
  };
  return res.status(statusCode).json(response);
};
