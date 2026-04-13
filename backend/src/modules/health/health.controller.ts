import { Request, Response } from 'express';
import { isDBConnected } from '../../shared/database.js';
import { checkAllServices } from '../../shared/health-monitor.js';

export function getHealth(req: Request, res: Response): void {
  const dbOk = isDBConnected();

  const body = {
    success: true,
    data: {
      status: dbOk ? 'healthy' : 'starting',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      services: {
        postgresql: dbOk ? 'connected' : 'connecting',
      },
    },
  };

  // Always return 200 so Cloud Run startup/liveness probes pass.
  // Use /api/health/services for detailed readiness check.
  res.status(200).json(body);
}

export async function getServiceHealth(req: Request, res: Response): Promise<void> {
  const results = await checkAllServices();
  res.json({ success: true, data: results });
}
