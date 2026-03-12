CREATE TABLE `assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channelId` int NOT NULL,
	`assetType` enum('logo','splash','hd_icon','fhd_icon','screenshot','hero_banner','background') NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` text,
	`fileName` varchar(500),
	`mimeType` varchar(100),
	`fileSizeBytes` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `channel_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channelId` int NOT NULL,
	`categoryId` int NOT NULL,
	`rowTitle` varchar(255),
	`rowOrder` int DEFAULT 0,
	`isVisible` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `channel_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `channel_videos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channelId` int NOT NULL,
	`videoId` int NOT NULL,
	`featuredFlag` boolean DEFAULT false,
	`sortOrder` int DEFAULT 0,
	`publishFrom` timestamp,
	`publishTo` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `channel_videos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `channels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`description` text,
	`status` enum('active','inactive','draft') NOT NULL DEFAULT 'draft',
	`themeJson` json,
	`brandingJson` json,
	`featureFlagsJson` json,
	`adSettingsJson` json,
	`feedPath` varchar(500),
	`language` varchar(10) DEFAULT 'en',
	`contentRating` varchar(50) DEFAULT 'all',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `channels_id` PRIMARY KEY(`id`),
	CONSTRAINT `channels_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `video_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`videoId` int NOT NULL,
	`categoryId` int NOT NULL,
	CONSTRAINT `video_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(500) NOT NULL,
	`slug` varchar(500) NOT NULL,
	`description` text,
	`thumbnailUrl` text,
	`streamUrl` text,
	`durationSeconds` int,
	`language` varchar(10) DEFAULT 'en',
	`contentType` enum('movie','series','episode','short','clip','special') DEFAULT 'clip',
	`contentRating` varchar(50) DEFAULT 'all',
	`releaseDate` varchar(20),
	`rightsOwner` varchar(255),
	`publishStatus` enum('draft','pending','approved','published','archived') NOT NULL DEFAULT 'draft',
	`validationStatus` enum('valid','warning','error','unchecked') DEFAULT 'unchecked',
	`validationErrors` json,
	`tags` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `videos_id` PRIMARY KEY(`id`),
	CONSTRAINT `videos_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','content_manager','publishing_manager') NOT NULL DEFAULT 'user';