-- Users table
create table users (
   id         serial primary key,
   username   text,
   email      text not null,
   password   text not null,
   created_at timestamp default now(),
   tm_username VARCHAR(255),
   tm_account_id VARCHAR(255),
   role       VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin'))
);

-- Admin configuration table
create table admin_config (
   id         serial primary key,
   config_key VARCHAR(100) UNIQUE NOT NULL,
   config_value TEXT NOT NULL,
   description TEXT,
   updated_at timestamp default now()
);

-- Alerts table
create table alerts (
   id         serial primary key,
   user_id    integer not null
      references users ( id )
         on delete cascade,
   username   text not null,
   email      text not null,
   created_at timestamp default now(),
   alert_type VARCHAR(20) DEFAULT 'accurate' CHECK (alert_type IN ('accurate', 'inaccurate')),
   map_count  integer DEFAULT 0,
   record_filter VARCHAR(20) DEFAULT 'top5' CHECK (record_filter IN ('top5', 'wr', 'all'))
);

-- Alert maps table 
create table alert_maps (
   alert_id integer
      references alerts ( id )
         on delete cascade,
   mapid    text not null,
   primary key ( alert_id,
                 mapid )
);

-- Driver notifications table (matching current development schema)
create table driver_notifications (
   id         serial primary key,
   user_id    integer not null
      references users ( id )
         on delete cascade,
   map_uid    VARCHAR(255) not null,
   current_position integer not null,
   created_at timestamp default now(),
   updated_at timestamp default now(),
   map_name   VARCHAR(500) not null,
   personal_best integer not null,
   status     VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
   last_checked timestamp default now(),
   is_active  boolean DEFAULT TRUE,

   -- Ensure one notification per user per map
   UNIQUE(user_id, map_uid)
);

-- Map positions table for inaccurate mode
create table map_positions (
   id         serial primary key,
   map_uid    VARCHAR(255) not null UNIQUE,
   position   integer not null,
   score      integer not null,
   last_checked timestamp default now(),
   created_at timestamp default now(),
   updated_at timestamp default now()
);

-- Notification history table
create table notification_history (
   id         serial primary key,
   user_id    integer not null
      references users ( id )
         on delete cascade,
   username   VARCHAR(255) not null,
   notification_type VARCHAR(20) NOT NULL CHECK (notification_type IN ('mapper_alert', 'driver_notification')),
   status     VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'no_new_times', 'technical_error', 'processing')),
   message    text,
   records_found integer DEFAULT 0,
   processing_date date not null,
   created_at timestamp default now()
);

-- Feedback table
create table feedback (
   id         serial primary key,
   user_id    integer not null
      references users ( id )
         on delete cascade,
   username   VARCHAR(255) not null,
   message    text not null,
   type       VARCHAR(50) DEFAULT 'general',
   created_at timestamp default now()
);

insert into users (
   username,
   email,
   password,
   role,
   created_at
) values ( 'teh_macho',
           'fantomass@gmail.com',
           '$2a$12$dBGjEMxqGcsXsb3bJ2Q5BuaQk61XrreSQnc6eHqCTmRsnJtha4s6K',
           'admin',
           now() );

-- Insert default admin configuration
insert into admin_config (config_key, config_value, description) values 
('max_maps_per_user', '200', 'Maximum number of maps a user can add to their watch list (safe timeout margin)'),
('max_driver_notifications', '200', 'Maximum number of driver notifications per user (optimized with position API)'),
('max_users_registration', '100', 'Maximum number of users that can register on the site'),
('trackmania_api_monthly_limit', '5184000', 'TrackMania API monthly limit (2 req/sec * 30 days)'),
('max_new_records_per_map', '20', 'Maximum new records per map before truncating in email (prevents spam)');

insert into alerts (
   user_id,
   username,
   email,
   created_at
) values ( 1,
           'teh_macho',
           'fantomass@gmail.com',
           now() );

-- Indexes for performance optimization
-- Index for TM account ID lookups (used in driver notifications)
CREATE INDEX IF NOT EXISTS idx_users_tm_account_id ON users(tm_account_id);

-- Index for email lookups (used in authentication)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index for username lookups (used in authentication)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Index for alerts by user_id (used in mapper alerts)
CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts(user_id);

-- Index for alert_maps by alert_id (used in mapper alerts)
CREATE INDEX IF NOT EXISTS idx_alert_maps_alert_id ON alert_maps(alert_id);

-- Indexes for driver notifications
CREATE INDEX IF NOT EXISTS idx_driver_notifications_user_id ON driver_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_driver_notifications_map_uid ON driver_notifications(map_uid);
CREATE INDEX IF NOT EXISTS idx_driver_notifications_status ON driver_notifications(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_driver_notifications_is_active ON driver_notifications(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_driver_notifications_last_checked ON driver_notifications(last_checked);

-- Indexes for map positions
CREATE INDEX IF NOT EXISTS idx_map_positions_map_uid ON map_positions(map_uid);
CREATE INDEX IF NOT EXISTS idx_map_positions_last_checked ON map_positions(last_checked);

-- Indexes for alerts
CREATE INDEX IF NOT EXISTS idx_alerts_alert_type ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_map_count ON alerts(map_count);

-- Indexes for notification history
CREATE INDEX IF NOT EXISTS idx_notification_history_user_id ON notification_history(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_processing_date ON notification_history(processing_date);
CREATE INDEX IF NOT EXISTS idx_notification_history_type ON notification_history(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_history_status ON notification_history(status);

-- Indexes for feedback
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);

-- Migration: add record_filter to existing alerts tables (run if column missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'alerts' AND column_name = 'record_filter'
  ) THEN
    ALTER TABLE alerts ADD COLUMN record_filter VARCHAR(20) NOT NULL DEFAULT 'top5'
      CHECK (record_filter IN ('top5', 'wr', 'all'));
  END IF;
END $$;