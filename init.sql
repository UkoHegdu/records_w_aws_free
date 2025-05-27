-- Users table
create table users (
   id         serial primary key,
   username   text,
   email      text not null,
   password   text not null,
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