import mongoose from "mongoose";

const mongoUri = process.env.MONGODB_URI;

await mongoose.connect(mongoUri);
console.log("Database connected!");
