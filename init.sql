CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
	userid TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);