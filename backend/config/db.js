const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    console.log("Connecting to:", process.env.MONGO_URI);
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("MongoDB Connected");
  } catch (err) {
    console.error("Mongo connect error:", err); // <-- full error, not just message
    process.exit(1);
  }
};

module.exports = connectDB;
