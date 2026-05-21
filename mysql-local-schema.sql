create database if not exists focus_pattern_tracker
  character set utf8mb4
  collate utf8mb4_unicode_ci;

use focus_pattern_tracker;

create table if not exists focus_users (
  username varchar(160) not null primary key,
  password_salt varchar(64) not null,
  password_hash varchar(128) not null,
  created_at timestamp not null default current_timestamp
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists focus_user_documents (
  username varchar(160) not null primary key,
  payload longtext not null,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  constraint focus_user_documents_user_fk
    foreign key (username) references focus_users (username)
    on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
