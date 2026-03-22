import Redis from "ioredis";

const url = process.env.REDIS_URL;
if (!url) {
  console.error("REDIS_URL not set");
  process.exit(1);
}

// Upstash requires TLS even when the URL uses redis:// scheme
const redis = new Redis(url, {
  connectTimeout: 8000,
  lazyConnect: true,
  tls: {},
  retryStrategy: () => null,
});

try {
  await redis.connect();
  const pong = await redis.ping();
  console.log("Redis PING:", pong);

  await redis.set("rilan:test", "hello", "EX", 10);
  const val = await redis.get("rilan:test");
  console.log("Redis SET/GET:", val);
  await redis.del("rilan:test");

  console.log("Redis connection: OK");
  await redis.quit();
  process.exit(0);
} catch (err) {
  console.error("Redis connection failed:", err.message);
  process.exit(1);
}
