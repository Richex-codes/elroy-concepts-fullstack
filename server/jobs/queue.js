const {Queue} = require('bullmq');
const Redis = require('ioredis');

const Redisconnection = new Redis()

const enquiryQueue = new Queue('enquiry-queue', { connection: Redisconnection });


module.exports = {
    enquiryQueue
}


