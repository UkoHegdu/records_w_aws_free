-- Users table
create table users (
   id         serial primary key,
   username   text,
   email      text not null,
   password   text not null,
   tm_username VARCHAR(255),
   tm_account_id VARCHAR(255),
   created_at timestamp default now()
);

-- Alerts table 
create table alerts (
   id         serial primary key,
   user_id    integer not null
      references users ( id )
         on delete cascade,
   username   text not null,
   email      text not null,
   created_at timestamp default now()
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

insert into users (
   username,
   email,
   password,
   created_at
) values ( 'teh_macho',
           'fantomass@gmail.com',
           '$2a$12$dBGjEMxqGcsXsb3bJ2Q5BuaQk61XrreSQnc6eHqCTmRsnJtha4s6K',
           now() );

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