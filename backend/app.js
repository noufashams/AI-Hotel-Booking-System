import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';
import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import cors from "cors";
import multer from "multer";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') }); 

const app = express();
const port = 3000;

// Database Connection
const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

db.connect()
  .then(() => console.log("✅ DATABASE CONNECTED SUCCESSFULLY to Port", process.env.DB_PORT))
  .catch(err => console.error("❌ DATABASE CONNECTION ERROR:", err.message));

// Multer Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '.pdf');
  }
});
const upload = multer({ storage: storage });

// Middleware
app.use(cors({ origin: 'http://127.0.0.1:5500', credentials: true })); 
app.use(bodyParser.json()); 
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// ROUTES
app.get("/", (req, res) => res.send("API is running..."));

app.post("/api/register-property", upload.single('license'), async (req, res) => {
    try {
        const { hotel_name, location, address, contact_email, password, contact_phone, description, slug } = req.body;
        const fileName = req.file ? req.file.filename : null;

        // --- PASTE THE CODE BELOW THIS LINE ---
        const query = `
            INSERT INTO hotels (
                hotel_name, 
                location, 
                address, 
                contact_email, 
                password, 
                license_filename, 
                status, 
                contact_phone, 
                description, 
                slug
            ) 
            VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)
        `;

        const values = [
            hotel_name,      // $1
            location,        // $2
            address,         // $3
            contact_email,   // $4
            password,        // $5
            fileName,        // $6
            contact_phone,   // $7
            description,     // $8
            slug             // $9
        ];
        // --- PASTE THE CODE ABOVE THIS LINE ---

        await db.query(query, values);
        res.json({ success: true, message: "Registered successfully!" });

    } catch (err) {
        console.error("❌ DATABASE ERROR:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});
app.post("/api/login", async (req, res) => {
    console.log("Login attempt for:", req.body.email);
    const { email, password } = req.body;

    // 1. MASTER ADMIN CHECK
    const MASTER_EMAIL = "admin@staysmart.com";
    const MASTER_PASS = "SuperSecret123!"; 

    if (email === MASTER_EMAIL && password === MASTER_PASS) {
        return res.json({ 
            success: true, 
            role: "admin", 
            redirect: "admin-dashboard.html" 
        });
    }

    try {
        // 2. CHECK HOTEL OWNERS
        const ownerResult = await db.query(
            "SELECT * FROM hotels WHERE contact_email = $1 AND password = $2",
            [email, password]
        );

        if (ownerResult.rows.length > 0) {
            const hotel = ownerResult.rows[0];
            
            if (hotel.status !== 'approved') {
                return res.status(403).json({ success: false, message: "Hotel pending approval." });
            }

            return res.json({ 
                success: true, 
                role: "hotel", // Matches your frontend check
                hotelId: hotel.hotel_id,
                hotelName: hotel.hotel_name,
                redirect: "hotel-dashboard.html" 
            });
        }

        // 3. CHECK STAFF USERS
        const staffResult = await db.query(
            "SELECT * FROM staff_users WHERE email = $1 AND password_hash = $2",
            [email, password]
        );

        if (staffResult.rows.length > 0) {
            const staff = staffResult.rows[0];
            return res.json({ 
                success: true, 
                role: "staff", 
                hotelId: staff.hotel_id,
                redirect: "staff-dashboard.html" 
            });
        }

        res.status(401).json({ success: false, message: "Invalid credentials." });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ success: false, message: "Server error." });
    }
});
// A. GET ALL PENDING HOTELS
app.get('/api/admin/pending-properties', async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM hotels WHERE status = 'pending' ORDER BY hotel_id DESC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// B. APPROVE A HOTEL
app.post('/api/approve-hotel', async (req, res) => {
    const { email } = req.body;
    try {
        await db.query("UPDATE hotels SET status = 'approved' WHERE contact_email = $1", [email]);
        res.json({ success: true, message: "Hotel Approved" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// C. REJECT (DELETE) A HOTEL
app.delete('/api/admin/delete-property/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query("DELETE FROM hotels WHERE hotel_id = $1", [id]);
        res.json({ success: true, message: "Property deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
app.get('/api/hotel/stats/:id', async (req, res) => {
    const hotelId = req.params.id;
    try {
        // We run 3 counts in one go for efficiency
        const rooms = await db.query("SELECT COUNT(*) FROM rooms WHERE hotel_id = $1", [hotelId]);
        const staff = await db.query("SELECT COUNT(*) FROM staff_users WHERE hotel_id = $1", [hotelId]);
        // Replace 'bookings' with your actual bookings table name if different
       const bookings = await db.query("SELECT COUNT(*) FROM bookings WHERE hotel_id = $1 AND booking_status = 'confirmed'", [hotelId]);
        res.json({
    success: true,
    totalRooms: Number(rooms.rows[0].count),
    staffCount: Number(staff.rows[0].count),
    activeBookings: Number(bookings.rows[0].count)
});
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Could not fetch stats" });
    }
});
// 1. REGISTER NEW STAFF
app.post('/api/staff/register', async (req, res) => {
    const { hotel_id, name, email, password } = req.body;
    try {
        await db.query(
            "INSERT INTO staff_users (hotel_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'staff')",
            [hotel_id, name, email, password] // Note: In production, hash this password!
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Email already exists or database error." });
    }
});

// 2. GET STAFF LIST FOR A HOTEL
app.get('/api/staff/list/:hotelId', async (req, res) => {
    try {
        const result = await db.query(
            "SELECT name, email, role FROM staff_users WHERE hotel_id = $1", 
            [req.params.hotelId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/rooms/add', async (req, res) => {
    const { hotel_id, room_type, price, total } = req.body;
    try {
        await db.query(
            "INSERT INTO rooms (hotel_id, room_type, price_per_night, total_rooms, available_rooms) VALUES ($1, $2, $3, $4, $5)",
            [hotel_id, room_type, price, total, total] // Initially, available = total
        );
        res.json({ success: true, message: "Room type added successfully" });
    } catch (err) {
        console.error("❌ Room Add Error:", err.message);
        res.status(500).json({ success: false, message: "Database error" });
    }
});
// GET ALL BOOKINGS FOR A SPECIFIC HOTEL
app.get('/api/bookings/list/:hotelId', async (req, res) => {
    try {
        const query = `
            SELECT b.*, r.room_type 
            FROM bookings b 
            JOIN rooms r ON b.room_id = r.room_id 
            WHERE b.hotel_id = $1 
            ORDER BY b.check_in_date ASC
        `;
        const result = await db.query(query, [req.params.hotelId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not fetch bookings" });
    }
});
// AI AUTOMATED BOOKING ENDPOINT
app.post('/api/ai/book-voice', async (req, res) => {
    const { hotel_id, guest_name, guest_phone, room_type, check_in, check_out } = req.body;

    try {
        // Find the room
        const room = await db.query(
            "SELECT room_id FROM rooms WHERE hotel_id = $1 AND room_type = $2 AND available_rooms > 0 LIMIT 1",
            [hotel_id, room_type]
        );

        if (room.rows.length === 0) return res.status(400).json({ success: false, message: "No rooms available" });

        const roomId = room.rows[0].room_id;

        // Insert into the RECREATED table
        await db.query(
            `INSERT INTO bookings (hotel_id, room_id, guest_name, guest_phone, check_in_date, check_out_date) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [hotel_id, roomId, guest_name, guest_phone, check_in, check_out]
        );

        // Update room availability
        await db.query("UPDATE rooms SET available_rooms = available_rooms - 1 WHERE room_id = $1", [roomId]);

        res.json({ success: true, message: "Booking creation successful" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Database error" });
    }
});
app.get('/api/availability/:hotelId', async (req, res) => {
    const { hotelId } = req.params;
    try {
        const result = await db.query(
            "SELECT room_type, price, available_rooms FROM rooms WHERE hotel_id = $1",
            [hotelId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No rooms found for this hotel ID." });
        }

        res.json(result.rows);
    } catch (err) {
        // This will print the EXACT database error in your terminal
        console.error("❌ Database Error:", err.message); 
        res.status(500).json({ error: "Database error", details: err.message });
    }
});
app.get('/api/hotel/dashboard-data/:hotelId', async (req, res) => {
    const { hotelId } = req.params;
    try {
        // 1. Get total confirmed bookings
        const totalBookings = await db.query(
            "SELECT COUNT(*) FROM bookings WHERE hotel_id = $1 AND booking_status = 'confirmed'",
            [hotelId]
        );

        // 2. Get total revenue (joining bookings and rooms to get the price)
        const revenue = await db.query(
            `SELECT SUM(r.price) as total_revenue 
             FROM bookings b 
             JOIN rooms r ON b.room_id = r.room_id 
             WHERE b.hotel_id = $1 AND b.booking_status = 'confirmed'`,
            [hotelId]
        );

        // 3. Get total available rooms count
        const availableRooms = await db.query(
            "SELECT SUM(available_rooms) as total_available FROM rooms WHERE hotel_id = $1",
            [hotelId]
        );

        res.json({
    success: true,
    data: {
        bookings_count: parseInt(totalBookings.rows[0].count),
        total_revenue: parseFloat(revenue.rows[0].total_revenue || 0),
        available_inventory: parseInt(availableRooms.rows[0].total_available || 0)
    }
});
    } catch (err) {
        console.error("Dashboard Error:", err.message);
        res.status(500).json({ success: false, error: "Could not fetch dashboard stats" });
    }
});
app.get('/api/search', async (req, res) => {
    const { location } = req.query; // e.g., /api/search?location=London
    
    try {
        const result = await db.query(
            "SELECT hotel_name, location, slug FROM hotels WHERE LOWER(location) LIKE $1 AND status = 'approved'",
            [`%${location.toLowerCase()}%`]
        );

        res.json({
            success: true,
            results: result.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Search failed" });
    }
});
app.get('/api/hotels/details/:slug', async (req, res) => {
    const { slug } = req.params;
    try {
        // Step 1: Find the hotel by slug
        const hotelResult = await db.query(
            "SELECT * FROM hotels WHERE slug = $1", 
            [slug]
        );

        if (hotelResult.rows.length > 0) {
            const hotel = hotelResult.rows[0];

            // Step 2: Fetch all rooms for this specific hotel
            const roomsResult = await db.query(
                "SELECT * FROM rooms WHERE hotel_id = $1", 
                [hotel.hotel_id]
            );

            // Send both hotel info and its rooms back to the frontend
            res.json({ 
                success: true, 
                hotel: hotel,
                rooms: roomsResult.rows 
            });
        } else {
            res.status(404).json({ success: false, message: "Hotel not found" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});
app.post('/api/ai/chat', async (req, res) => {
    const { message, hotelId } = req.body;
    const input = message.toLowerCase();

    try {
        // 1. DATABASE CHECK: What rooms are available?
        // Note: I updated this to match your table's column name 'price_per_night'
        const roomData = await db.query("SELECT room_type, price_per_night FROM rooms WHERE hotel_id = $1", [hotelId]);
        const availableRooms = roomData.rows;

        // 2. LOGIC: User wants to BOOK a room
        if (input.includes("book") || input.includes("reserve")) {
            const selectedRoom = availableRooms.find(r => input.includes(r.room_type.toLowerCase()));

            if (selectedRoom) {
                await db.query(
                    "INSERT INTO bookings (hotel_id, guest_name, room_type, check_in_date) VALUES ($1, $2, $3, $4)",
                    [hotelId, "Voice Guest", selectedRoom.room_type, '2026-01-01'] 
                );

                return res.json({ 
                    reply: `Excellent choice. I have reserved the ${selectedRoom.room_type} for you at $${selectedRoom.price_per_night}. Your confirmation is ready.` 
                });
            } else {
                return res.json({ 
                    reply: "I can help with that. Which room type would you like to reserve? We have " + 
                    availableRooms.map(r => r.room_type).join(" and ") 
                });
            }
        }

        // 3. LOGIC: User is just ASKING about prices
        if (input.includes("price") || input.includes("how much")) {
            const priceList = availableRooms.map(r => `${r.room_type} for $${r.price_per_night}`).join(", ");
            return res.json({ reply: `Our current rates are: ${priceList}.` });
        }

        res.json({ reply: "I am your StaySmart concierge. How can I help you with your stay today?" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ reply: "I'm having trouble accessing the booking system." });
    }
});
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});