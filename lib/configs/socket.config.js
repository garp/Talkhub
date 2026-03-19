module.exports = {
  mongoUri: process.env.MONGO_URI,
  mongoOptions: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  },
};
