CREATE TABLE `ai_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobType` enum('enrich_video','bulk_enrich','generate_tags','validate_content','generate_description','generate_title') NOT NULL,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`videoId` int,
	`channelId` int,
	`inputPayload` json,
	`outputPayload` json,
	`resultSummary` text,
	`errorMessage` text,
	`processedCount` int DEFAULT 0,
	`failedCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `ai_jobs_id` PRIMARY KEY(`id`)
);
