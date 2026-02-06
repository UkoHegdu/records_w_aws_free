-- Backend (Neon) init: run once to create all tables required by /backend.
-- Tables: users, admin_config, alerts, alert_maps, driver_notifications, map_positions,
--         notification_history, feedback (from serverless init);
--         api_tokens (Trackmania/OAuth2 token cache), daily_emails, map_leaderboard_cache (daily cron + email),
--         map_search_jobs (map search jobs).

-- ---------------------------------------------------------------------------
-- From serverless init.sql
-- ---------------------------------------------------------------------------

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
   map_count  integer DEFAULT 0
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

-- Driver notifications table
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
   UNIQUE(user_id, map_uid)
);

-- Map positions table (inaccurate mode)
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

-- ---------------------------------------------------------------------------
-- Backend-only tables
-- ---------------------------------------------------------------------------

-- API tokens: Trackmania Nadeo + OAuth2 token cache (tokenStore.js)
create table api_tokens (
   provider   text not null,
   token_type text not null,
   token      text not null,
   created_at bigint not null,
   primary key (provider, token_type)
);

-- Daily emails: one row per (username, date); cron Phase 1/2 fill content, Phase 3 sends (dailyEmailStore.js)
create table daily_emails (
   username       text not null,
   email          text not null,
   date           date not null,
   mapper_content text default '',
   driver_content text default '',
   status         text not null default 'pending' check (status in ('pending', 'sent')),
   created_at     bigint not null,
   updated_at     bigint not null,
   primary key (username, date)
);
create index if not exists idx_daily_emails_date on daily_emails (date);

-- Map leaderboard cache: by map+date for daily cron (dailyEmailStore.js)
create table map_leaderboard_cache (
   cache_key        text primary key,
   leaderboard_data jsonb not null,
   created_at       bigint not null
);
create index if not exists idx_map_leaderboard_cache_created on map_leaderboard_cache (created_at);

-- Map search jobs: async map search (mapSearchJobStorePg.js)
create table map_search_jobs (
   job_id       text primary key,
   username     text not null,
   period       text not null default '1d',
   status       text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
   created_at   bigint not null,
   updated_at   bigint not null,
   result       jsonb,
   error_message text
);
create index if not exists idx_map_search_jobs_status on map_search_jobs (status);
create index if not exists idx_map_search_jobs_created_at on map_search_jobs (created_at);

-- ---------------------------------------------------------------------------
-- Seed data (optional; adjust or remove for production)
-- ---------------------------------------------------------------------------

-- Seed: run only on fresh DB (or comment out if re-running)
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

insert into admin_config (config_key, config_value, description) values
('max_maps_per_user', '200', 'Maximum number of maps a user can add to their watch list (safe timeout margin)'),
('max_driver_notifications', '200', 'Maximum number of driver notifications per user (optimized with position API)'),
('max_users_registration', '100', 'Maximum number of users that can register on the site'),
('trackmania_api_monthly_limit', '5184000', 'TrackMania API monthly limit (2 req/sec * 30 days)'),
('max_new_records_per_map', '20', 'Maximum new records per map before truncating in email (prevents spam)')
on conflict (config_key) do nothing;

insert into alerts (user_id, username, email, created_at) values (1, 'teh_macho', 'fantomass@gmail.com', now());

-- ---------------------------------------------------------------------------
-- Indexes (serverless init)
-- ---------------------------------------------------------------------------

create index if not exists idx_users_tm_account_id on users(tm_account_id);
create index if not exists idx_users_email on users(email);
create index if not exists idx_users_username on users(username);
create index if not exists idx_alerts_user_id on alerts(user_id);
create index if not exists idx_alert_maps_alert_id on alert_maps(alert_id);
create index if not exists idx_driver_notifications_user_id on driver_notifications(user_id);
create index if not exists idx_driver_notifications_map_uid on driver_notifications(map_uid);
create index if not exists idx_driver_notifications_status on driver_notifications(status) where status = 'active';
create index if not exists idx_driver_notifications_is_active on driver_notifications(is_active) where is_active = true;
create index if not exists idx_driver_notifications_last_checked on driver_notifications(last_checked);
create index if not exists idx_map_positions_map_uid on map_positions(map_uid);
create index if not exists idx_map_positions_last_checked on map_positions(last_checked);
create index if not exists idx_alerts_alert_type on alerts(alert_type);
create index if not exists idx_alerts_map_count on alerts(map_count);
create index if not exists idx_notification_history_user_id on notification_history(user_id);
create index if not exists idx_notification_history_processing_date on notification_history(processing_date);
create index if not exists idx_notification_history_type on notification_history(notification_type);
create index if not exists idx_notification_history_status on notification_history(status);
create index if not exists idx_feedback_created_at on feedback(created_at desc);
create index if not exists idx_feedback_user_id on feedback(user_id);
