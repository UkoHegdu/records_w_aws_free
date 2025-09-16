-- SQL Update Script for Notification History Table
-- Run this on your existing database to add notification history functionality

-- 1. Create notification_history table
CREATE TABLE IF NOT EXISTS notification_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(255) NOT NULL,
    notification_type VARCHAR(20) NOT NULL CHECK (notification_type IN ('mapper_alert', 'driver_notification')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'no_new_times', 'technical_error', 'processing')),
    message TEXT,
    records_found INTEGER DEFAULT 0,
    processing_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_history_user_id ON notification_history(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_processing_date ON notification_history(processing_date);
CREATE INDEX IF NOT EXISTS idx_notification_history_notification_type ON notification_history(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_history_status ON notification_history(status);
CREATE INDEX IF NOT EXISTS idx_notification_history_user_date_type ON notification_history(user_id, processing_date, notification_type);

-- 3. Add alert_type and map_count columns to alerts table (if not already present)
DO $$ 
BEGIN
    -- Add alert_type column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'alert_type') THEN
        ALTER TABLE alerts ADD COLUMN alert_type VARCHAR(20) DEFAULT 'accurate' CHECK (alert_type IN ('accurate', 'inaccurate'));
    END IF;
    
    -- Add map_count column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'map_count') THEN
        ALTER TABLE alerts ADD COLUMN map_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- 4. Add indexes for alerts table (if not already present)
CREATE INDEX IF NOT EXISTS idx_alerts_alert_type ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_map_count ON alerts(map_count);

-- 5. Create map_positions table (if not already present)
CREATE TABLE IF NOT EXISTS map_positions (
    id SERIAL PRIMARY KEY,
    map_uid VARCHAR(255) UNIQUE NOT NULL,
    position INTEGER NOT NULL,
    score INTEGER NOT NULL,
    last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Add indexes for map_positions table
CREATE INDEX IF NOT EXISTS idx_map_positions_map_uid ON map_positions(map_uid);
CREATE INDEX IF NOT EXISTS idx_map_positions_last_checked ON map_positions(last_checked);

-- 7. Create driver_notifications table (if not already present)
CREATE TABLE IF NOT EXISTS driver_notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    map_uid VARCHAR(255) NOT NULL,
    tm_username VARCHAR(255) NOT NULL,
    tm_account_id VARCHAR(255) NOT NULL,
    current_position INTEGER NOT NULL,
    current_score INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, map_uid, tm_username)
);

-- 8. Add indexes for driver_notifications table
CREATE INDEX IF NOT EXISTS idx_driver_notifications_user_id ON driver_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_driver_notifications_map_uid ON driver_notifications(map_uid);
CREATE INDEX IF NOT EXISTS idx_driver_notifications_tm_username ON driver_notifications(tm_username);

-- 9. Update admin_config table to include new configuration values (if not already present)
INSERT INTO admin_config (config_key, config_value, description) 
VALUES 
    ('max_driver_notifications', '200', 'Maximum number of driver notifications per user'),
    ('max_maps_per_user', '200', 'Maximum number of maps per user for accurate alerts'),
    ('max_new_records_per_map', '20', 'Maximum new records per map before truncating email content'),
    ('trackmania_api_monthly_limit', '5184000', 'Monthly API limit for TrackMania API (2 req/sec * 30 days * 24 hours * 3600 seconds)')
ON CONFLICT (config_key) DO NOTHING;

-- 10. Add role column to users table (if not already present)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'role') THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin'));
        
        -- Set first user as admin (optional - you can modify this)
        UPDATE users SET role = 'admin' WHERE id = 1;
    END IF;
END $$;

-- 11. Create admin_config table (if not already present)
CREATE TABLE IF NOT EXISTS admin_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Insert default admin configuration values (if not already present)
INSERT INTO admin_config (config_key, config_value, description) 
VALUES 
    ('max_maps_per_user', '200', 'Maximum number of maps per user'),
    ('max_driver_notifications', '200', 'Maximum number of driver notifications per user'),
    ('max_users', '100', 'Maximum number of users allowed to register'),
    ('max_new_records_per_map', '20', 'Maximum new records per map before truncating email content'),
    ('trackmania_api_monthly_limit', '5184000', 'Monthly API limit for TrackMania API'),
    ('popular_map_message', 'This map has more than 20 New Times', 'Message shown for popular maps with many new records')
ON CONFLICT (config_key) DO NOTHING;

-- Verification queries (optional - run these to check if everything was created correctly)
-- SELECT 'notification_history table created' as status WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_history');
-- SELECT 'map_positions table created' as status WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'map_positions');
-- SELECT 'driver_notifications table created' as status WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'driver_notifications');
-- SELECT 'admin_config table created' as status WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_config');
-- SELECT 'role column added to users' as status WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role');
-- SELECT 'alert_type column added to alerts' as status WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alerts' AND column_name = 'alert_type');
-- SELECT 'map_count column added to alerts' as status WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alerts' AND column_name = 'map_count');

COMMIT;
