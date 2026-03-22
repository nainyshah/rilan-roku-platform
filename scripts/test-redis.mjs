import Redis from "ioredis";

const url = process.env.REDIS_URL;
if (!url) {
  console.error("REDIS_URL not set");
  process.exit(1);
}

const redis = new Redis(url, { connectTimeout: 5000, lazyConnect: true });

try {
  await redis.connect();
  const pong = await redis.ping();
  console.log("Redis PING:", pong);

  // Test set/get
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
