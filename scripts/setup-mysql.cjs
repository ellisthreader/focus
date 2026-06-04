#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const config = {
  host: process.env.FOCUS_MYSQL_HOST || "127.0.0.1",
  database: process.env.FOCUS_MYSQL_DATABASE || "focus_pattern_tracker",
  user: process.env.FOCUS_MYSQL_USER || "focus_app",
  password: process.env.FOCUS_MYSQL_PASSWORD || ""
};

const adminCommand = process.env.FOCUS_MYSQL_ADMIN_COMMAND || "sudo mysql";

if (!config.password) {
  console.error("FOCUS_MYSQL_PASSWORD is required.");
  console.error("Example: FOCUS_MYSQL_PASSWORD=\"replace-with-a-strong-password\" npm run setup:mysql");
  process.exit(1);
}

const sql = `
create database if not exists ${identifier(config.database)}
  character set utf8mb4
  collate utf8mb4_unicode_ci;

create user if not exists ${literal(config.user)}@'localhost' identified by ${literal(config.password)};
alter user ${literal(config.user)}@'localhost' identified by ${literal(config.password)};
create user if not exists ${literal(config.user)}@'127.0.0.1' identified by ${literal(config.password)};
alter user ${literal(config.user)}@'127.0.0.1' identified by ${literal(config.password)};
grant all privileges on ${identifier(config.database)}.* to ${literal(config.user)}@'localhost';
grant all privileges on ${identifier(config.database)}.* to ${literal(config.user)}@'127.0.0.1';

use ${identifier(config.database)};

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
`;

const result = spawnSync(adminCommand, {
  input: sql,
  shell: true,
  stdio: ["pipe", "inherit", "inherit"]
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log(`MySQL schema ready for ${config.database} as ${config.user}@${config.host}.`);

function literal(value) {
  return "'" + String(value).replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";
}

function identifier(value) {
  return "`" + String(value).replace(/`/g, "``") + "`";
}
