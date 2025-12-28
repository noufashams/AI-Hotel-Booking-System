CREATE TABLE hotels (
    hotel_id SERIAL PRIMARY KEY,
    hotel_name VARCHAR(150) NOT NULL,
    location VARCHAR(100) NOT NULL,
    address TEXT,
    contact_phone VARCHAR(20),
    contact_email VARCHAR(150),
    description TEXT,
    languages_supported TEXT[],  -- e.g. {'English','Malayalam'}
    slug VARCHAR(200) UNIQUE,    -- for clean URLs
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE staff_users (
    staff_id SERIAL PRIMARY KEY,
    hotel_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) DEFAULT 'staff', -- admin / staff
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id) ON DELETE CASCADE
);
CREATE TABLE rooms (
    room_id SERIAL PRIMARY KEY,
    hotel_id INT NOT NULL,
    room_type VARCHAR(100) NOT NULL,   -- Deluxe, Standard
    price_per_night NUMERIC(10,2) NOT NULL,
    total_rooms INT NOT NULL,
    available_rooms INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id) ON DELETE CASCADE
);
CREATE TABLE bookings (
    booking_id SERIAL PRIMARY KEY,
    hotel_id INT NOT NULL,
    room_id INT NOT NULL,
    guest_name VARCHAR(100) NOT NULL,
    guest_phone VARCHAR(20) NOT NULL,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    booking_status VARCHAR(50) DEFAULT 'confirmed', -- confirmed / cancelled
    payment_status VARCHAR(50) DEFAULT 'pending',   -- pending / paid
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
);
CREATE TABLE guest_queries (
    query_id SERIAL PRIMARY KEY,
    hotel_id INT NOT NULL,
    query_text TEXT NOT NULL,
    intent_detected VARCHAR(100),
    response_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id) ON DELETE CASCADE
);
CREATE TABLE analytics_summary (
    summary_id SERIAL PRIMARY KEY,
    hotel_id INT NOT NULL,
    date DATE NOT NULL,
    total_bookings INT DEFAULT 0,
    occupancy_rate NUMERIC(5,2),
    most_booked_room VARCHAR(100),
    FOREIGN KEY (hotel_id) REFERENCES hotels(hotel_id) ON DELETE CASCADE
);

