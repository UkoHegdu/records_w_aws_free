-- Driver Notifications Database Migration
-- This script adds the driver_notifications table to support driver notification functionality

-- Create driver_notifications table
CREATE TABLE IF NOT EXISTS driver_notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    map_uid VARCHAR(255) NOT NULL,
    map_name VARCHAR(500) NOT NULL,
    current_position INTEGER NOT NULL,
    personal_best INTEGER NOT NULL, -- Time in milliseconds
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT NOW(),
    last_checked TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Ensure one notification per user per map
    UNIQUE(user_id, map_uid)
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_driver_notifications_user_id ON driver_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_driver_notifications_active ON driver_notifications(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_driver_notifications_last_checked ON driver_notifications(last_checked);
CREATE INDEX IF NOT EXISTS idx_driver_notifications_status ON driver_notifications(status) WHERE status = 'active';

-- Add comments for documentation
COMMENT ON TABLE driver_notifications IS 'Stores driver notifications for position tracking on specific maps';
COMMENT ON COLUMN driver_notifications.user_id IS 'Reference to users table - the user who created the notification';
COMMENT ON COLUMN driver_notifications.map_uid IS 'Trackmania Exchange Map UID for the map being tracked';
COMMENT ON COLUMN driver_notifications.map_name IS 'Display name of the map for UI purposes';
COMMENT ON COLUMN driver_notifications.current_position IS 'Current position of the user on this map leaderboard';
COMMENT ON COLUMN driver_notifications.created_at IS 'When the notification was created';
COMMENT ON COLUMN driver_notifications.last_checked IS 'When the notification was last checked for position changes';
COMMENT ON COLUMN driver_notifications.is_active IS 'Whether the notification is currently active';
