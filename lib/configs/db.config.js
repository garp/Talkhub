module.exports = {
  mongoUri: process.env.MONGO_URI,
  mongoOptions: { dbName: process.env.NODE_ENV === 'dev' ? 'talkhub-dev' : 'talkhub-stage' },
};
