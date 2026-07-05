// scripts/seedAdmin.js
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Admin = require("../model/adminlog.model"); // ✅ correct path

const seedAdmin = async () => {
    try {
        // Use the same DB URL your app uses
        await mongoose.connect(process.env.MONGO_URL);
        console.log("DB connected");

        // Check if a permanent admin already exists
        const existingAdmin = await Admin.findOne({ role: "admin" });
        if (existingAdmin) {
            console.log("✅ Admin already exists, skipping...");
            process.exit(0);
        }

        // Hash the password before saving
        const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);

        // Create the one permanent admin account
        await Admin.create({
            fullName: "MercyTech",
            email: process.env.ADMIN_EMAIL,
            password: hashedPassword,
            role: "admin",
        });

        console.log("✅ Admin created successfully");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error seeding admin:", error);
        process.exit(1);
    }
};

seedAdmin();
