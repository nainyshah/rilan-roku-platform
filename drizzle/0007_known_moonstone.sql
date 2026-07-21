CREATE TABLE `screensaver_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255),
	`mediaType` enum('image','video') NOT NULL DEFAULT 'image',
	`imageUrl` text,
	`videoUrl` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `screensaver_items_id` PRIMARY KEY(`id`)
);
