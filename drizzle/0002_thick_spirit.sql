CREATE TABLE `import_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(500) NOT NULL,
	`csvS3Key` text,
	`csvUrl` text,
	`totalRows` int NOT NULL DEFAULT 0,
	`importedCount` int NOT NULL DEFAULT 0,
	`skippedCount` int NOT NULL DEFAULT 0,
	`duplicateCount` int NOT NULL DEFAULT 0,
	`errorCount` int NOT NULL DEFAULT 0,
	`resultsJson` json,
	`defaultChannelSlug` varchar(255),
	`defaultCategorySlug` varchar(255),
	`importedBy` int,
	`importedByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `import_logs_id` PRIMARY KEY(`id`)
);
