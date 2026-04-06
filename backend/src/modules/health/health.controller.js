import { isDBConnected } from '../../shared/database.js';
import { isRedisConnected } from '../../shared/redis.js';

export function getHealth(req, res) {
  const mongoOk = isDBConnected();
  const redisOk = isRedisConnected();
  const healthy = mongoOk && redisOk;

  const body = {
    success: healthy,
    data: {
      status: healthy ? 'healthy' : 'degraded',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      services: {
        mongodb: mongoOk ? 'connected' : 'disconnected',
        redis: redisOk ? 'connected' : 'disconnected',
      },
    },
  };

  return res.status(healthy ? 200 : 503).json(body);
}
