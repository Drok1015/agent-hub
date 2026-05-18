CREATE TABLE `agent_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`token` text NOT NULL,
	`name` text DEFAULT '',
	`expires_at` integer,
	`revoked` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'offline' NOT NULL,
	`capabilities` text DEFAULT '[]',
	`metadata` text DEFAULT '{}',
	`last_seen` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`from_agent` text NOT NULL,
	`to_agent` text,
	`task_id` text,
	`channel` text DEFAULT 'direct' NOT NULL,
	`type` text DEFAULT 'text' NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '',
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` integer DEFAULT 0,
	`created_by` text NOT NULL,
	`assigned_to` text,
	`payload` text DEFAULT '{}',
	`result` text,
	`error` text,
	`timeout_ms` integer DEFAULT 300000,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_name_unique` ON `agents` (`name`);