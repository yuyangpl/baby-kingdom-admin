// Set test environment variables before any imports
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/baby-kingdom-test';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
process.env.JWT_SECRET = 'test-secret';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars!!';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
