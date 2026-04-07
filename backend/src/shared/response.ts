import { Response } from 'express';

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export function success(res: Response, data: unknown = null, statusCode = 200): Response {
  const body: { success: boolean; data?: unknown } = { success: true };
  if (data !== null) body.data = data;
  return res.status(statusCode).json(body);
}

export function paginated(res: Response, data: unknown[], pagination: PaginationInfo): Response {
  return res.status(200).json({
    success: true,
    data,
    pagination,
  });
}

export function created(res: Response, data: unknown): Response {
  return success(res, data, 201);
}
