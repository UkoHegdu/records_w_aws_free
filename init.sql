create table alerts (
   id         serial primary key,
   username   text not null,
   email      text not null,
   uuserid    text not null,
   created_at timestamp default now()
);

insert into alerts (
   username,
   email,
   uuserid,
   created_at
) values ( 'teh_macho',
           'fantomass@gmail.com',
           '444',
           now() );