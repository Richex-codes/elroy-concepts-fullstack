require('dotenv').config();
const {Queue} = require('bullmq');
const Redis = require('ioredis');

const Redisconnection = new Redis(process.env.REDIS_URL, {
    tls: {},
  maxRetriesPerRequest: null,   // ✅ REQUIRED
  enableReadyCheck: false       // ✅ REQUIRED (Upstash)
});

const enquiryQueue = new Queue('enquiry-queue', { connection: Redisconnection });


module.exports = {
    enquiryQueue
}


