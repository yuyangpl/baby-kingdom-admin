import { JwtPayload } from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: 'admin' | 'approver' | 'viewer';
      };
    }
  }
}

export {};
