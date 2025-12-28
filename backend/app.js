import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load the file
dotenv.config({ path: path.join(__dirname, '.env') }); 

// Debugging: This will now show you if the variable exists but has a different name
console.log("Checking Environment Variables...");
console.log("EMAIL_USER:", process.env.EMAIL_USER ? `LOADED (${process.env.EMAIL_USER})` : "NOT FOUND");

import express from "express";
// ... continue with your other imports
import bodyParser from "body-parser";
import pg from "pg";
import cors from "cors";
import multer from "multer";
import nodemailer from "nodemailer";

// ... the rest of your code remains exactly the same

// Debugging line: This will show in your terminal if the variables are actually loading
console.log("Email User:", process.env.EMAIL_USER ? "LOADED" : "NOT FOUND");

const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // use SSL
  auth: {
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS  
  }
});

const app = express();
const port = 3000;

// ... the rest of your code (storage, middleware, db) stays the same

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '.pdf'); // Forces .pdf extension
  }
});

const upload = multer({ storage: storage });

// Middleware
app.use(cors()); 
app.use(bodyParser.json()); 
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});
db.connect();

// 1. Home Route
app.get("/", (req, res) => {
  res.send("Welcome to the Smart Hospitality System API");
});

// 2. LOGIN ROUTE
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1 AND password = $2", [email, password]);
    if (result.rows.length > 0) {
      res.json({ success: true, message: "Login successful", user: result.rows[0] });
    } else {
      res.status(401).json({ success: false, message: "Invalid email or password" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// 3. SIGNUP ROUTE
app.post("/api/register-property", upload.single('license'), async (req, res) => {
    const { hotel_id, hotel_name, contact_email, address, password } = req.body;
    
    // req.file.filename is the random string Multer generated (e.g., '5e8f...')
    const fileName = req.file ? req.file.filename : null; 

    try {
        const query = `
            INSERT INTO properties (license_number, hotel_name, contact_email, address, password, license_filename, status) 
            VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        `;
        const values = [hotel_id, hotel_name, contact_email, address, password, fileName];
        
        await db.query(query, values);
        res.json({ success: true, message: "Registered successfully!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});
// Get all pending property registrations for the Admin
app.get("/api/admin/pending-properties", async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM properties WHERE status = 'pending' ORDER BY id DESC");
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch properties" });
    }
});
// 4. APPROVAL ROUTE (Add this!)
app.post("/api/approve-hotel", async (req, res) => {
    const { email, hotel_name } = req.body;

    try {
        // Update database status to 'verified'
        const dbResult = await db.query(
            "UPDATE properties SET status = 'verified' WHERE contact_email = $1", 
            [email]
        );

        // Prepare approval email
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'STAYSMART | Registration Approved',
            html: `
                <div style="font-family: Arial, sans-serif; border: 1px solid #ddd; padding: 20px;">
                    <h2 style="color: #DAA520;">Congratulations!</h2>
                    <p>Hello <strong>${hotel_name}</strong>,</p>
                    <p>Your property registration has been verified by our admin team.</p>
                    <p>You can now log in to your dashboard and start managing your bookings.</p>
                    <br>
                    <a href="http://localhost:3000/hotel-login.html" style="background: #DAA520; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Login to Dashboard</a>
                </div>
            `
        };

        // Send the email
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Email Error:", error);
                // Even if email fails, we return success because the DB was updated
                return res.json({ success: true, message: "Approved, but email notification failed." });
            }
            console.log("Approval email sent to: " + email);
            res.json({ success: true, message: "Approval successful and email sent!" });
        });

    } catch (err) {
        console.error("Approval Error:", err);
        res.status(500).json({ success: false, error: "Server error during approval." });
    }
});
app.delete("/api/admin/delete-property/:id", async (req, res) => {
    try {
        await db.query("DELETE FROM properties WHERE id = $1", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});
app.post("/api/hotel/login", async (req, res) => {
    const { email, password } = req.body;
    
    console.log("--- LOGIN ATTEMPT ---");
    console.log("Input Email:", email);
    console.log("Input Password:", password);

    try {
        // 1. Check if the email exists
        const result = await db.query("SELECT * FROM properties WHERE contact_email = $1", [email]);
        
        if (result.rows.length === 0) {
            console.log("❌ RESULT: Email not found in database.");
            return res.status(401).json({ success: false, message: "Invalid email" });
        }

        const hotel = result.rows[0];
        console.log("✅ Database Found Hotel:", hotel.hotel_name);
        console.log("Database Password:", hotel.password);
        console.log("Database Status:", hotel.status);

        // 2. Check Password
        if (hotel.password !== password) {
            console.log("❌ RESULT: Password does not match.");
            return res.status(401).json({ success: false, message: "Invalid password" });
        }

        // 3. Check Status
        if (hotel.status !== 'verified') {
            console.log("❌ RESULT: Status is not 'verified'. Current status:", hotel.status);
            return res.status(403).json({ success: false, message: "Account pending approval" });
        }

        console.log("🚀 RESULT: SUCCESS! Redirecting...");
        res.json({ 
            success: true, 
            hotelName: hotel.hotel_name,
            hotelId: hotel.id 
        });

    } catch (err) {
        console.error("❌ DATABASE ERROR:", err);
        res.status(500).json({ success: false });
    }
});
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});